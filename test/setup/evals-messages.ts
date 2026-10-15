// The evaluation app's components read messages through
// lib/evals/messages/runtime, which holds none until something registers
// them (launch L-24c): on the server the catalogue module does it when it
// loads. Tests get both full catalogues the same way.
import "@/lib/evals/messages/en";
