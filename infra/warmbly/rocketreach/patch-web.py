#!/usr/bin/env python3
"""Add RocketReach alongside the existing Apollo dashboard extension."""
from pathlib import Path
import argparse,shutil,subprocess,sys
parser=argparse.ArgumentParser();parser.add_argument('source',type=Path);args=parser.parse_args()
subprocess.run([sys.executable,str(Path(__file__).parent.parent/'apollo/patch-web.py'),str(args.source)],check=True)
root=args.source/'web/src/app/app/integrations';page=root/'page.tsx';s=page.read_text()
if 'RocketReachPanel' not in s:
 s=s.replace('import ApolloPanel from "./_components/ApolloPanel";', 'import ApolloPanel from "./_components/ApolloPanel";\nimport RocketReachPanel from "./_components/RocketReachPanel";')
 s=s.replace('export default function IntegrationsPage() {','''export default function IntegrationsPage() {
    const [rocketReachOpen, setRocketReachOpen] = React.useState(() => new URLSearchParams(window.location.search).get("provider") === "rocketreach");
    function openRocketReach(open: boolean) {
        const url = new URL(window.location.href);
        if (open) url.searchParams.set("provider", "rocketreach");
        else url.searchParams.delete("provider");
        window.history.replaceState(null, "", url.toString());
        setRocketReachOpen(open);
    }''')
 s=s.replace('    if (apolloOpen) return', '    if (rocketReachOpen) return <RocketReachPanel onBack={() => openRocketReach(false)} />;\n    if (apolloOpen) return')
 marker='            <PageBody>\n';assert marker in s
 s=s.replace(marker,marker+'''                {(!q || "rocketreach prospecting enrichment data leads".includes(q)) && (
                    <section>
                        <SectionBar label="RocketReach" count={1} />
                        <button type="button" onClick={() => openRocketReach(true)} className="w-full text-left px-5 py-5 border-b border-slate-200 hover:bg-slate-50 transition-colors flex items-center gap-4">
                            <span className="size-10 rounded-xl bg-sky-100 text-sky-800 inline-flex items-center justify-center text-xl font-semibold">R</span>
                            <span className="flex-1"><span className="block text-sm font-semibold text-slate-900">RocketReach</span><span className="block mt-1 text-[12px] text-slate-500">Find people and companies, enrich emails and phones, and import into Warmbly. Multiple accounts, classic and Universal Credits API.</span></span>
                            <span className="text-[12px] text-sky-700">Open RocketReach →</span>
                        </button>
                    </section>
                )}
''',1)
 s=s.replace('value={catalog.length + 1}','value={catalog.length + 2}')
 page.write_text(s)
shutil.copy2(Path(__file__).parent/'RocketReachPanel.tsx',root/'_components/RocketReachPanel.tsx')
print('RocketReach and Apollo integrated into Warmbly.')
