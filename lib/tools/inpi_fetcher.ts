import type { AxiosInstance } from "axios";
import axios from "axios";
import { wrapper } from "axios-cookiejar-support";
import { CookieJar } from "tough-cookie";
import type { FetchInpiDataTool, FilterInpiResultsTool, FindMostRecentTrademarkTool, GetInpiDetailsTool } from "../../baml_client"; // Import BAML tool types
import { getLogLevel } from "../../baml_client/config";
import { ThreadStore } from "../state"; // Import ThreadStore to access static cache methods

// --- Interfaces for Data Structures ---

// Matches BAML class TrademarkEntry
export interface TrademarkEntry {
  Numero: string | null;
  Prioridade: string | null;
  Marca: string | null;
  Situacao: string | null;
  Titular: string | null;
  Classes: string[] | null;
  URL: string | null;
}

// Represents the full raw results stored in cache
interface InpiRawResults {
  trademarks: TrademarkEntry[];
  errors: string[];
}

// --- Interfaces for Tool Handler Results (with serialization method) ---

interface LLMSerializable {
  toLLMString(): string;
}

// Result of fetch_inpi_data handler
export class InpiFetchSummary implements LLMSerializable {
  type = 'inpi_fetch_summary' as const;
  constructor(public result_id: string, public summary: string) { }

  toLLMString(): string {
    return `result_id: ${this.result_id}\nsummary: ${this.summary}`;
  }
}

// Result of filter_inpi_results handler
export class InpiFilteredResults implements LLMSerializable {
  type = 'inpi_filtered_results' as const;
  constructor(public trademarks: TrademarkEntry[], public errors: string[]) { }

  toLLMString(): string {
    const summary: string[] = [];
    if (this.trademarks.length > 0) {
      summary.push(`Found ${this.trademarks.length} matching trademark(s):`);
      // Show details of the filtered results (up to a limit)
      for (const t of this.trademarks.slice(0, 5)) { // Show more details for filtered results
        summary.push(`- Numero: ${t.Numero ?? 'N/A'}, Marca: ${t.Marca ?? 'N/A'}, Situacao: ${t.Situacao ?? 'N/A'}, Titular: ${t.Titular ?? 'N/A'}`);
      }
      if (this.trademarks.length > 5) {
        summary.push(`... (and ${this.trademarks.length - 5} more)`);
      }
    } else {
      summary.push("No trademarks matched the filter criteria.");
    }
    if (this.errors.length > 0) {
      summary.push(`Errors encountered: ${this.errors.join(', ')}`);
    }
    return summary.join('\n');
  }
}

// Result of get_inpi_details or find_most_recent_trademark handler (success case)
export class TrademarkEntryResult implements LLMSerializable {
  type = 'inpi_trademark_entry' as const;
  constructor(public trademark: TrademarkEntry) { }

  toLLMString(): string {
    const entry = this.trademark;
    return `Details for Numero ${entry.Numero}:\n` +
      `  Marca: ${entry.Marca ?? 'N/A'}\n` +
      `  Situacao: ${entry.Situacao ?? 'N/A'}\n` +
      `  Titular: ${entry.Titular ?? 'N/A'}\n` +
      `  Classes: ${entry.Classes?.join(', ') ?? 'N/A'}\n` +
      `  URL: ${entry.URL ?? 'N/A'}`;
  }
}

// Result type for errors from INPI tools
export class InpiErrorResult implements LLMSerializable {
  type = 'inpi_error' as const;
  constructor(public error: string) { }

  toLLMString(): string {
    return `Error: ${this.error}`;
  }
}

// Union type for all possible INPI handler results
export type InpiHandlerResult = InpiFetchSummary | InpiFilteredResults | TrademarkEntryResult | InpiErrorResult;

// --- Helper Functions (Scraping, Parsing, Date) ---

/**
 * Extract the total number of pages from the response content.
 */
function extractTotalPages(content: string): number {
  const regex1 = /page=(\d+)" class="normal">\.{3}(\d+)<\/a>/;
  const match1 = content.match(regex1);
  if (match1) {
    return Number.parseInt(match1[2], 10);
  }
  const paginationSectionRegex = /Páginas de Resultados:<br>([\s\S]*?)<\/font>/;
  const paginationSectionMatch = content.match(paginationSectionRegex);
  if (paginationSectionMatch) {
    const section = paginationSectionMatch[1];
    const pageNumbersRegex = /page=(\d+)|<b>(\d+)<\/b>/g;
    const pages: number[] = [];
    let match: RegExpExecArray | null = pageNumbersRegex.exec(section);
    while (match !== null) {
      if (match[1]) pages.push(Number.parseInt(match[1], 10));
      else if (match[2]) pages.push(Number.parseInt(match[2], 10));
      match = pageNumbersRegex.exec(section);
    }
    if (pages.length > 0) return Math.max(...pages);
  }
  return 1;
}

/**
 * Clean and parse the classes field.
 */
function cleanClasses(classeText: string): string[] {
  const regex = /NCL\([\d]+\)[^NCL]+/g;
  let classes = classeText.match(regex);
  if (!classes) classes = [classeText];
  return classes
    .map((classe) => classe.trim().replace(/\s+/g, " "))
    .filter((cleaned) => cleaned && cleaned !== "-");
}

/**
 * Scrapes INPI for trademark data across all pages.
 * Returns the full raw results.
 */
async function scrapeAllInpiData(marca: string): Promise<InpiRawResults> {
  const jar = new CookieJar();
  const rawClient = axios.create({ jar, withCredentials: true, timeout: 30000, headers: { /* User-Agent */ } } as any);
  const client: AxiosInstance = wrapper(rawClient as any) as AxiosInstance;

  const allTrademarkData: TrademarkEntry[] = [];
  const errors: string[] = [];
  const initialUrl = "https://busca.inpi.gov.br/pePI/servlet/LoginController?action=login";
  const searchUrl = "https://busca.inpi.gov.br/pePI/servlet/MarcasServletController";
  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36', // Example User-Agent
    'Referer': 'https://busca.inpi.gov.br/pePI/jsp/marcas/Pesquisa_classe_basica.jsp',
    'Origin': 'https://busca.inpi.gov.br'
  };

  try {
    await client.get(initialUrl); // Start session

    const searchData = new URLSearchParams({
      js_pesquisa: 'M',
      expression: 'simple',
      operation: 'contain',
      pagina: '1',
      buscaExata: 'nao',
      txt: 'Pesquisa+Radical',
      marca: marca,
      classeInter: "",
      registerPerPage: "29", // Max appears to be 29
      Action: "searchMarca",
      tipoPesquisa: "BY_MARCA_CLASSIF_BASICA"
    });

    let response = await client.post(searchUrl, searchData.toString(), { headers });
    let content = response.data as string;
    const totalPages = extractTotalPages(content);
    let currentPage = 1;
    if (getLogLevel() !== "OFF") console.log(`Total pages found: ${totalPages}`);

    while (currentPage <= totalPages) {
      if (getLogLevel() !== "OFF") console.log(`Scraping page ${currentPage} of ${totalPages}...`);
      if (currentPage > 1) {
        const pageData = new URLSearchParams({ Action: "nextPageMarca", page: currentPage.toString() });
        try {
          response = await client.post(searchUrl, pageData.toString(), { headers });
          content = response.data as string;
        } catch (pageError: any) {
          errors.push(`Failed to fetch page ${currentPage}: ${pageError.message || pageError}`);
          break; // Stop pagination on error
        }
      }

      const tableRowsPattern = /<tr bgColor="#E0E0E0" class=normal>[\s\S]*?<\/tr>|<tr bgColor="white" class=normal>[\s\S]*?<\/tr>/g;
      const rows = content.match(tableRowsPattern);

      if (rows) {
        if (getLogLevel() !== "OFF") console.log(`Found ${rows.length} rows on page ${currentPage}.`);
        for (const rowHtml of rows) {
          const columnsRegex = /<td.*?>([\s\S]*?)<\/td>/g;
          const columns: string[] = [];
          let colMatch: RegExpExecArray | null = columnsRegex.exec(rowHtml);
          while (colMatch !== null) {
            columns.push(colMatch[1].replace(/\u00A0/g, ' ').trim()); // Replace non-breaking spaces
            colMatch = columnsRegex.exec(rowHtml);
          }
          if (columns.length < 8) {
            console.warn("Skipping row with less than 8 columns:", rowHtml);
            continue;
          }

          let numero: string | null = null;
          let url: string | null = null;
          const linkRegex = /<a.*?>([\s\S]*?)<\/a>/;
          const urlRegex = /<a\s+href=['"]([^'"]+)['"]/;
          const numeroLinkMatch = columns[0].match(linkRegex);
          const urlMatch = columns[0].match(urlRegex);
          if (urlMatch) url = urlMatch[1].trim().startsWith('/') ? `https://busca.inpi.gov.br${urlMatch[1].trim()}` : urlMatch[1].trim();
          numero = (numeroLinkMatch ? numeroLinkMatch[1] : columns[0]).replace(/<[^>]+>/g, "").trim();

          const prioridade = columns[1].replace(/<[^>]+>/g, "").trim();
          let marcaName: string | null = null;
          const marcaBoldMatch = columns[3].match(/<b>([\s\S]*?)<\/b>/);
          marcaName = (marcaBoldMatch ? marcaBoldMatch[1] : columns[3]).replace(/<[^>]+>/g, "").trim();
          const situacao = columns[5].replace(/<[^>]+>/g, "").trim();
          const titular = columns[6].replace(/<[^>]+>/g, "").trim();
          const classes = cleanClasses(columns[7].replace(/<[^>]+>/g, "").trim());

          allTrademarkData.push({
            Numero: numero !== "-" ? numero : null,
            Prioridade: prioridade !== "-" ? prioridade : null,
            Marca: marcaName !== "-" ? marcaName : null,
            Situacao: situacao !== "-" ? situacao : null,
            Titular: titular !== "-" ? titular : null,
            Classes: classes.length > 0 ? classes : null,
            URL: url,
          });
        }
      } else {
        if (getLogLevel() !== "OFF") console.log(`No rows found on page ${currentPage}.`);
      }

      // Check if the 'Próxima' link exists before incrementing
      if (currentPage < totalPages && !(content.includes('>Próxima»</a>'))) {
        console.warn(`'Próxima' link not found on page ${currentPage} despite totalPages being ${totalPages}. Stopping pagination.`);
        break; // Stop if next link isn't there but we expect more pages
      }
      currentPage++;
    }
  } catch (error: any) {
    errors.push(`Request failed during search/pagination: ${error.message || error}`);
  }

  return { trademarks: allTrademarkData, errors: errors };
}

/**
 * Parses a DD/MM/YYYY string into a Date object or null if invalid.
 */
function parsePrioridadeDate(dateString: string | null | undefined): Date | null {
  if (!dateString || typeof dateString !== 'string') {
    return null;
  }
  const parts = dateString.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!parts) {
    console.warn(`Invalid date format encountered: ${dateString}`);
    return null; // Invalid format
  }
  // Note: Month is 0-indexed in JavaScript Date object
  const day = Number.parseInt(parts[1], 10);
  const month = Number.parseInt(parts[2], 10) - 1;
  const year = Number.parseInt(parts[3], 10);

  // Basic validation
  if (day < 1 || day > 31 || month < 0 || month > 11 || year < 1900 || year > 2100) {
    console.warn(`Invalid date components after parsing: ${dateString} -> D:${day}, M:${month + 1}, Y:${year}`);
    return null;
  }

  const date = new Date(year, month, day);
  // Check if the date components rolled over (e.g., 31/04/2024 becomes 01/05/2024)
  if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) {
    console.warn(`Date components rolled over during Date construction: ${dateString}`);
    return null;
  }
  return date;
}

// --- Tool Handlers ---

/**
 * Handler for the `fetch_inpi_data` tool.
 * Scrapes INPI, stores full results in cache, and returns a summary + result_id.
 */
async function fetchInpiDataHandler(step: FetchInpiDataTool): Promise<InpiFetchSummary> {
  if (getLogLevel() !== "OFF") console.log(`Starting INPI fetch for marca: ${step.marca}`);
  const results = await scrapeAllInpiData(step.marca);
  const resultId = ThreadStore.addInpiResults(results.trademarks); // Store full results

  let summary = `Found ${results.trademarks.length} trademark(s).`;
  if (results.errors.length > 0) {
    summary += ` Encountered errors: ${results.errors.join(', ')}`;
  }

  if (getLogLevel() !== "OFF") console.log(`INPI fetch complete for ${step.marca}. Result ID: ${resultId}, Summary: ${summary}`);
  return new InpiFetchSummary(resultId, summary);
}

/**
 * Handler for the `filter_inpi_results` tool.
 * Retrieves cached results and filters them based on criteria.
 */
async function filterInpiResultsHandler(step: FilterInpiResultsTool): Promise<InpiFilteredResults | InpiErrorResult> {
  if (getLogLevel() !== "OFF") console.log(`Filtering INPI results for ID: ${step.result_id} with criteria:`, {
    situacao: step.situacao,
    titular: step.titular,
    classe_ncl: step.classe_ncl
  });
  const cachedResults = ThreadStore.getInpiResults(step.result_id);

  if (!cachedResults) {
    const errorMsg = `No cached results found for ID: ${step.result_id}`;
    console.error(errorMsg);
    return new InpiErrorResult(errorMsg);
  }

  const filtered = cachedResults.filter(t => {
    let match = true;
    if (step.situacao && t.Situacao?.toLowerCase() !== step.situacao.toLowerCase()) {
      match = false;
    }
    if (step.titular && !t.Titular?.toLowerCase().includes(step.titular.toLowerCase())) {
      match = false;
    }
    // Handle NCL filtering carefully - check if *any* class matches
    if (step.classe_ncl && !(t.Classes?.some(c => c.toLowerCase() === step.classe_ncl?.toLowerCase()))) {
      match = false;
    }
    return match;
  });

  if (getLogLevel() !== "OFF") console.log(`Filtering complete for ID: ${step.result_id}. Found ${filtered.length} matching trademarks.`);
  return new InpiFilteredResults(filtered, []); // Return filtered results
}

/**
 * Handler for the `get_inpi_details` tool.
 * Retrieves a specific trademark entry from cached results by its Numero.
 */
async function getInpiDetailsHandler(step: GetInpiDetailsTool): Promise<TrademarkEntryResult | InpiErrorResult> {
  if (getLogLevel() !== "OFF") console.log(`Getting INPI details for ID: ${step.result_id}, Numero: ${step.numero}`);
  const cachedResults = ThreadStore.getInpiResults(step.result_id);

  if (!cachedResults) {
    const errorMsg = `No cached results found for ID: ${step.result_id}`;
    console.error(errorMsg);
    return new InpiErrorResult(errorMsg);
  }

  const found = cachedResults.find(t => t.Numero === step.numero);

  if (!found) {
    const errorMsg = `Trademark with Numero ${step.numero} not found in results for ID: ${step.result_id}`;
    console.warn(errorMsg);
    return new InpiErrorResult(errorMsg);
  }

  if (getLogLevel() !== "OFF") console.log(`Details found for Numero ${step.numero} in results ID: ${step.result_id}.`);
  return new TrademarkEntryResult(found); // Return the specific entry
}

/**
 * Handler for the `find_most_recent_trademark` tool.
 * Retrieves cached results, parses 'Prioridade' dates, and finds the entry with the latest date.
 */
async function findMostRecentTrademarkHandler(step: FindMostRecentTrademarkTool): Promise<TrademarkEntryResult | InpiErrorResult> {
  if (getLogLevel() !== "OFF") console.log(`Finding most recent trademark for result ID: ${step.result_id}`);
  const cachedResults = ThreadStore.getInpiResults(step.result_id);

  if (!cachedResults) {
    const errorMsg = `No cached results found for ID: ${step.result_id}`;
    console.error(errorMsg);
    return new InpiErrorResult(errorMsg);
  }

  if (cachedResults.length === 0) {
    const errorMsg = 'No trademarks found in the results to determine the most recent.';
    console.warn(`${errorMsg} (ID: ${step.result_id})`);
    return new InpiErrorResult(errorMsg);
  }

  let mostRecentEntry: TrademarkEntry | null = null;
  let maxDate: Date | null = null;

  for (const entry of cachedResults) {
    const currentDate = parsePrioridadeDate(entry.Prioridade);
    if (currentDate) {
      if (!maxDate || currentDate.getTime() > maxDate.getTime()) { // Compare time for precision
        maxDate = currentDate;
        mostRecentEntry = entry;
      }
    } else {
      if (getLogLevel() !== "OFF") console.warn(`Skipping entry with unparseable date: ${entry.Numero} - ${entry.Prioridade}`);
    }
  }

  if (!mostRecentEntry) {
    const errorMsg = `Could not determine the most recent trademark as no valid 'Prioridade' dates were found.`;
    console.warn(`${errorMsg} (ID: ${step.result_id})`);
    return new InpiErrorResult(errorMsg);
  }

  if (getLogLevel() !== "OFF") console.log(`Most recent trademark found for ID ${step.result_id}: Numero ${mostRecentEntry.Numero} with date ${mostRecentEntry.Prioridade}`);
  return new TrademarkEntryResult(mostRecentEntry);
}


// Export the handler map for registration in assistant.ts
export const inpiToolHandlers = {
  fetch_inpi_data: fetchInpiDataHandler,
  filter_inpi_results: filterInpiResultsHandler,
  get_inpi_details: getInpiDetailsHandler,
  find_most_recent_trademark: findMostRecentTrademarkHandler,
} as const;

// Export BAML tool types for external use if needed
export type { FetchInpiDataTool, FilterInpiResultsTool, GetInpiDetailsTool, FindMostRecentTrademarkTool };
