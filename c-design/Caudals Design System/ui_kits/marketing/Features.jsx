// Features.jsx
function CaudalsFeatures(){
  const feats = [
    {ic:'▦',t:'Any data type, any format',d:'Tabular, image, text, audio, sensor — converted to ML-ready Parquet, JSON-Lines, TFRecords.'},
    {ic:'⚡',t:'Delivery in days, not months',d:'Catalog datasets available immediately. Custom sourced datasets in 1-3 weeks.'},
    {ic:'◉',t:'Quality you can verify',d:'Every dataset processed through our validation pipeline with provenance documentation.'},
    {ic:'◌',t:'Compliance built in',d:'GDPR and CCPA pipelines. Data usage agreements standardized across suppliers.'},
    {ic:'↗',t:'Revenue share for suppliers',d:'Companies with proprietary data earn ongoing revenue each time their dataset is licensed.'},
    {ic:'⌘',t:'Private SKUs available',d:'Request exclusive datasets for your team — escrowed, anonymized, and never re-sold.'},
  ];
  return (
    <section style={{padding:'120px 48px',background:'#fff'}}>
      <div style={{maxWidth:1200,margin:'0 auto'}}>
        <div style={{maxWidth:640,marginBottom:72}}>
          <div style={{font:'700 13px var(--font-sans)',color:'#059669',marginBottom:14,textTransform:'uppercase',letterSpacing:'.12em'}}>Capabilities</div>
          <h2 style={{font:'400 48px/1.1 var(--font-sans)',letterSpacing:'-.03em',color:'#000',margin:0}}>
            Built for teams who need data that <span style={{font:'italic 400 1em "New York","Iowa",Georgia,serif',color:'rgba(15,118,110,.9)'}}>actually works</span>
          </h2>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'64px 48px'}}>
          {feats.map(f => (
            <div key={f.t}>
              <div style={{width:48,height:48,borderRadius:10,background:'#ecfdf5',color:'#059669',display:'flex',alignItems:'center',justifyContent:'center',marginBottom:20,font:'400 22px var(--font-sans)'}}>{f.ic}</div>
              <h3 style={{font:'700 17px/1.3 var(--font-sans)',color:'#000',margin:'0 0 8px'}}>{f.t}</h3>
              <p style={{font:'400 14px/1.6 var(--font-sans)',color:'#6b7280',margin:0,maxWidth:280}}>{f.d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
window.CaudalsFeatures = CaudalsFeatures;
