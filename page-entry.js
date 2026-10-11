// Shareable HTML routes open the full website directly at the requested section.
// Run in the head so the standalone fallback does not flash before navigation.
const entryUrl = new URL('/' + location.search, location.origin);
entryUrl.searchParams.delete('lang');
entryUrl.hash = location.hash || document.currentScript.dataset.section;
location.replace(entryUrl.href);
