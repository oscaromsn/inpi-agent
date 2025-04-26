import axios from "axios";
import type { AxiosInstance } from "axios";
import { wrapper } from "axios-cookiejar-support";
import { CookieJar } from "tough-cookie";
import { ThreadStore } from "../state"; // Import ThreadStore to access static cache methods

// Interfaces matching BAML classes
export interface TrademarkEntry {
  Numero: string | null;
  Prioridade: string | null;
  Marca: string | null;
  Situacao: string | null;
  Titular: string | null;
  Classes: string[] | null;
  URL: string | null;
}

// Represents the full results stored in cache
export interface InpiScraperResults {
  trademarks: TrademarkEntry[];
  errors: string[];
}

// Represents the summary returned to the LLM after initial fetch
export interface InpiFetchSummary {
    result_id: string;
    summary: string;
}

// Type for the input step for fetchInpiData
interface FetchInpiDataInput {
    intent: "fetch_inpi_data";
    marca: string;
}

// Type for the input step for filterInpiResults
interface FilterInpiResultsInput {
    intent: "filter_inpi_results";
    result_id: string;
    situacao?: string | null;
    titular?: string | null;
    classe_ncl?: string | null;
}

// Type for the input step for getInpiDetails
interface GetInpiDetailsInput {
    intent: "get_inpi_details";
    result_id: string;
    numero: string;
}

// Type for the input step for findMostRecentTrademark
interface FindMostRecentTrademarkInput {
    intent: "find_most_recent_trademark";
    result_id: string;
}


/**
 * Extract the total number of pages from the response content.
 */


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
async function scrapeAllInpiData(marca: string): Promise<InpiScraperResults> {
    const jar = new CookieJar();
    // Cast config to any to allow 'jar' option in axios.create
    const rawClient = axios.create({ jar, withCredentials: true, timeout: 30000, headers: { /* User-Agent */ } } as any);
    const client: AxiosInstance = wrapper(rawClient as any) as AxiosInstance;

    const allTrademarkData: TrademarkEntry[] = [];
    const errors: string[] = [];
    const initialUrl = "https://busca.inpi.gov.br/pePI/servlet/LoginController?action=login";
    const searchUrl = "https://busca.inpi.gov.br/pePI/servlet/MarcasServletController";
    const headers = { /* Content-Type, Referer, User-Agent, Origin */ };

    try {
        await client.get(initialUrl); // Start session

        const searchData = new URLSearchParams({ /* Initial search params */
            buscaExata: "nao",
            txt: "Pesquisa+Radical",
            marca: marca,
            classeInter: "",
            registerPerPage: "29",
            Action: "searchMarca",
            tipoPesquisa: "BY_MARCA_CLASSIF_BASICA"
        });

        let response = await client.post(searchUrl, searchData.toString(), { headers });
        let content = response.data as string;
        const totalPages = extractTotalPages(content);
        let currentPage = 1;

        while (currentPage <= totalPages) {
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
                for (const rowHtml of rows) {
                    const columnsRegex = /<td.*?>([\s\S]*?)<\/td>/g;
                    const columns: string[] = [];
                    let colMatch: RegExpExecArray | null = columnsRegex.exec(rowHtml);
                    while (colMatch !== null) {
                        columns.push(colMatch[1].replace(/\u00A0/g, ' ').trim());
                        colMatch = columnsRegex.exec(rowHtml);
                    }
                    if (columns.length < 8) continue;

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
            }

             if (currentPage < totalPages && !(/Próxima»<\/a>/.test(content))) break; // Stop if next link isn't there
            currentPage++;
        }
    } catch (error: any) {
        errors.push(`Request failed during search/pagination: ${error.message || error}`);
    }

    return { trademarks: allTrademarkData, errors: errors };
}


/**
 * Handler for the `fetch_inpi_data` tool.
 * Scrapes INPI, stores full results in cache, and returns a summary + result_id.
 */
async function fetchInpiDataHandler(step: FetchInpiDataInput): Promise<InpiFetchSummary> {
    console.log(`Starting INPI fetch for marca: ${step.marca}`);
    const results = await scrapeAllInpiData(step.marca);
    const resultId = ThreadStore.addInpiResults(results.trademarks); // Store full results

    let summary = `Found ${results.trademarks.length} trademark(s).`;
    if (results.errors.length > 0) {
        summary += ` Encountered errors: ${results.errors.join(', ')}`;
    }

    console.log(`INPI fetch complete for ${step.marca}. Result ID: ${resultId}, Summary: ${summary}`);
    return {
        result_id: resultId,
        summary: summary,
    };
}

/**
 * Handler for the `filter_inpi_results` tool.
 * Retrieves cached results and filters them based on criteria.
 */
async function filterInpiResultsHandler(step: FilterInpiResultsInput): Promise<InpiScraperResults> {
    console.log(`Filtering INPI results for ID: ${step.result_id} with criteria:`, {
        situacao: step.situacao,
        titular: step.titular,
        classe_ncl: step.classe_ncl
    });
    const cachedResults = ThreadStore.getInpiResults(step.result_id);

    if (!cachedResults) {
        console.error(`No cached results found for ID: ${step.result_id}`);
        return { trademarks: [], errors: [`No cached results found for ID: ${step.result_id}`] };
    }

    const filtered = cachedResults.filter(t => {
        let match = true;
        if (step.situacao && t.Situacao?.toLowerCase() !== step.situacao.toLowerCase()) {
            match = false;
        }
        if (step.titular && !t.Titular?.toLowerCase().includes(step.titular.toLowerCase())) {
            match = false;
        }
        if (step.classe_ncl && !t.Classes?.some(c => c.toLowerCase() === step.classe_ncl?.toLowerCase())) {
            match = false;
        }
        return match;
    });

    console.log(`Filtering complete for ID: ${step.result_id}. Found ${filtered.length} matching trademarks.`);
    return { trademarks: filtered, errors: [] }; // Return filtered results
}

/**
 * Handler for the `get_inpi_details` tool.
 * Retrieves a specific trademark entry from cached results by its Numero.
 */
async function getInpiDetailsHandler(step: GetInpiDetailsInput): Promise<TrademarkEntry | { error: string }> {
    console.log(`Getting INPI details for ID: ${step.result_id}, Numero: ${step.numero}`);
    const cachedResults = ThreadStore.getInpiResults(step.result_id);

    if (!cachedResults) {
        console.error(`No cached results found for ID: ${step.result_id}`);
        return { error: `No cached results found for ID: ${step.result_id}` };
    }

    const found = cachedResults.find(t => t.Numero === step.numero);

    if (!found) {
        console.warn(`Trademark with Numero ${step.numero} not found in results ID: ${step.result_id}`);
        return { error: `Trademark with Numero ${step.numero} not found in results.` };
    }

    console.log(`Details found for Numero ${step.numero} in results ID: ${step.result_id}.`);
    return found; // Return the specific entry
}


// Export the handler map for registration in assistant.ts
// Includes the new handlers.
export const inpiToolHandlers = {
  fetch_inpi_data: fetchInpiDataHandler,
  filter_inpi_results: filterInpiResultsHandler,
  get_inpi_details: getInpiDetailsHandler,
  find_most_recent_trademark: findMostRecentTrademarkHandler, // Add new handler
};

// --- Helper function for date parsing ---

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
     console.warn(`Invalid date components after parsing: ${dateString} -> D:${day}, M:${month+1}, Y:${year}`);
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


/**
 * Handler for the `find_most_recent_trademark` tool.
 * Retrieves cached results, parses 'Prioridade' dates, and finds the entry with the latest date.
 */
async function findMostRecentTrademarkHandler(step: { result_id: string }): Promise<TrademarkEntry | { error: string }> {
    console.log(`Finding most recent trademark for result ID: ${step.result_id}`);
    const cachedResults = ThreadStore.getInpiResults(step.result_id);

    if (!cachedResults) {
        console.error(`No cached results found for ID: ${step.result_id}`);
        return { error: `No cached results found for ID: ${step.result_id}` };
    }

    if (cachedResults.length === 0) {
        console.warn(`No trademarks found in cached results for ID: ${step.result_id}`);
        return { error: 'No trademarks found in the results to determine the most recent.' };
    }

    let mostRecentEntry: TrademarkEntry | null = null;
    let maxDate: Date | null = null;

    for (const entry of cachedResults) {
        const currentDate = parsePrioridadeDate(entry.Prioridade);
        if (currentDate) {
            if (!maxDate || currentDate > maxDate) {
                maxDate = currentDate;
                mostRecentEntry = entry;
            }
        }
    }

    if (!mostRecentEntry) {
        console.warn(`Could not determine the most recent trademark for ID: ${step.result_id} (no valid dates found).`);
        return { error: `Could not determine the most recent trademark as no valid 'Prioridade' dates were found.` };
    }

    console.log(`Most recent trademark found for ID ${step.result_id}: Numero ${mostRecentEntry.Numero} with date ${mostRecentEntry.Prioridade}`);
    return mostRecentEntry;
}