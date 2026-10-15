/**
 * Newsreader, the public site's display face, loads after the first paint
 * (launch L-24d).
 *
 * Until `<html data-serif>` is set, `globals.css` points `--font-newsreader`
 * at its metric-matched local fallback ("Newsreader Fallback", which next/font
 * generates), so laying out the page requests no Newsreader file. This script
 * sets the attribute once the first contentful paint has been presented; the
 * browser then requests the faces the page uses and swaps them in, as
 * `font-display: swap` already did. What a reader sees is unchanged: the
 * fallback shows until Newsreader arrives, then Newsreader, with the
 * optical-size axis kept (founder decision, PROGRESS §5).
 *
 * Before, the hero's italic word requested the italic file (~130 KB) at the
 * first layout. On a fast connection it often arrived before the first paint
 * was presented, and Lighthouse's simulation then counted it, with the normal
 * file, on the path to the largest paint (+0.6–1 s on slow 4G).
 *
 * Loaded as an async `data:` script that React hoists into the head: it
 * neither blocks the parser nor delays rendering. Browsers without paint
 * timing, and pages that never paint while visible, open the gate after four
 * seconds.
 */
const SERIF_GATE = `(function(){var h=document.documentElement;if(h.hasAttribute("data-serif"))return;function o(){h.setAttribute("data-serif","")}var t=setTimeout(o,4e3);try{var p=new PerformanceObserver(function(l){if(l.getEntriesByName("first-contentful-paint").length){p.disconnect();clearTimeout(t);o()}});p.observe({type:"paint",buffered:true})}catch(e){clearTimeout(t);o()}})()`;

export const SERIF_GATE_SRC = `data:text/javascript,${encodeURIComponent(SERIF_GATE)}`;
