/**
 * Layout version of the PDF and Word report documents. Stored files carry it
 * in their export path (`reports/<revision>[.es].v<n>.pdf`), so a download
 * after a layout change renders a fresh copy instead of serving one made with
 * the previous layout. Raise it whenever the documents' content or order
 * changes. 2 = launch L-17: cover page, executive summary and "Fix these first".
 */
export const REPORT_DOCUMENT_VERSION = 2;
export const REPORT_DOCUMENT_SUFFIX = `.v${REPORT_DOCUMENT_VERSION}`;
