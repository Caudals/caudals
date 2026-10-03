#!/usr/bin/env python3
"""Apply the Apollo dashboard extension to the pinned Warmbly web source."""
from pathlib import Path
import argparse
import shutil

parser = argparse.ArgumentParser()
parser.add_argument('source', type=Path)
args = parser.parse_args()
root = args.source / 'web/src/app/app/integrations'
page = root / 'page.tsx'
content = page.read_text()
if 'ApolloPanel' not in content:
    content = content.replace('import StatusPill from "./_components/StatusPill";', 'import StatusPill from "./_components/StatusPill";\nimport ApolloPanel from "./_components/ApolloPanel";')
    content = content.replace('export default function IntegrationsPage() {', '''export default function IntegrationsPage() {
    const [apolloOpen, setApolloOpen] = React.useState(() => new URLSearchParams(window.location.search).get("provider") === "apollo");
    function openApollo(open: boolean) {
        const url = new URL(window.location.href);
        if (open) url.searchParams.set("provider", "apollo");
        else url.searchParams.delete("provider");
        window.history.replaceState(null, "", url.toString());
        setApolloOpen(open);
    }''')
    marker = '    return (\n        <Page>'
    assert marker in content
    content = content.replace(marker, '    if (apolloOpen) return <ApolloPanel onBack={() => openApollo(false)} />;\n\n' + marker, 1)
    marker = '            <PageBody>\n'
    assert marker in content
    content = content.replace(marker, marker + '''                {(!q || "apollo prospecting enrichment data leads".includes(q)) && (
                    <section>
                        <SectionBar label="Prospecting" count={1} />
                        <button type="button" onClick={() => openApollo(true)} className="w-full text-left px-5 py-5 border-b border-slate-200 hover:bg-slate-50 transition-colors flex items-center gap-4">
                            <span className="size-10 rounded-xl bg-amber-100 text-amber-800 inline-flex items-center justify-center text-xl font-semibold">A</span>
                            <span className="flex-1"><span className="block text-sm font-semibold text-slate-900">Apollo</span><span className="block mt-1 text-[12px] text-slate-500">Search people and companies, enrich emails and phones, and import into Warmbly. Multiple accounts and credit controls.</span></span>
                            <span className="text-[12px] text-sky-700">Open Apollo →</span>
                        </button>
                    </section>
                )}
''', 1)
    content = content.replace('value={catalog.length}', 'value={catalog.length + 1}')
    page.write_text(content)
shutil.copy2(Path(__file__).parent / 'ApolloPanel.tsx', root / '_components/ApolloPanel.tsx')
print('Apollo integrated into the Warmbly dashboard.')
