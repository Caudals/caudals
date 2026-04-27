// HowItWorks.jsx — segmented toggle + 4-step grid
function CaudalsHowItWorks(){
  const [side,setSide] = React.useState('buyers');
  const buyers = [
    {n:'01',t:'Describe what you need',d:'Tell us the data type, industry, volume, and format. We scope the opportunity within 24 hours.'},
    {n:'02',t:'We source &amp; process',d:'Our network of 140+ supplier companies negotiate, clean, and anonymize the dataset.'},
    {n:'03',t:'Review a sample',d:'Validate schema, coverage, and quality on a 1% sample before the full delivery.'},
    {n:'04',t:'Deliver ML-ready',d:'Parquet, JSON-Lines, or TFRecords delivered to your bucket with documentation.'},
  ];
  const suppliers = [
    {n:'01',t:'Share your data catalog',d:'Brief us on what your company produces and which subsets you can license.'},
    {n:'02',t:'We package &amp; anonymize',d:'Our pipeline strips PII, harmonizes schema, and verifies data quality.'},
    {n:'03',t:'List in the marketplace',d:'Your datasets are discoverable by buyers under your company name and SLA.'},
    {n:'04',t:'Earn revenue share',d:'Ongoing payout each time your dataset is licensed. You approve every buyer.'},
  ];
  const steps = side==='buyers'?buyers:suppliers;
  return (
    <section style={{padding:'120px 48px',background:'#f9fafb'}}>
      <div style={{maxWidth:1200,margin:'0 auto'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end',marginBottom:56,flexWrap:'wrap',gap:24}}>
          <div>
            <div style={{font:'700 13px var(--font-sans)',color:'#059669',marginBottom:14,textTransform:'uppercase',letterSpacing:'.12em'}}>How it works</div>
            <h2 style={{font:'400 48px/1.1 var(--font-sans)',letterSpacing:'-.03em',color:'#000',margin:0,maxWidth:640}}>
              From brief to bucket in <span style={{font:'italic 400 1em "New York","Iowa",Georgia,serif',color:'rgba(15,118,110,.9)'}}>under two weeks</span>
            </h2>
          </div>
          <div style={{display:'inline-flex',padding:4,borderRadius:9999,background:'#fff',border:'1px solid #f3f4f6'}}>
            {['buyers','suppliers'].map(s=>(
              <button key={s} onClick={()=>setSide(s)} style={{height:36,padding:'0 20px',borderRadius:9999,border:0,background:side===s?'#000':'transparent',color:side===s?'#fff':'#6b7280',font:'700 13px var(--font-sans)',cursor:'pointer',textTransform:'capitalize'}}>{s}</button>
            ))}
          </div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:1,background:'#e5e7eb',border:'1px solid #e5e7eb',borderRadius:14,overflow:'hidden'}}>
          {steps.map(s => (
            <div key={s.n} style={{background:'#fff',padding:'36px 28px'}}>
              <div style={{font:'700 11px var(--font-mono)',color:'#059669',marginBottom:22}}>{s.n}</div>
              <h3 style={{font:'700 17px/1.3 var(--font-sans)',color:'#000',margin:'0 0 10px'}} dangerouslySetInnerHTML={{__html:s.t}}/>
              <p style={{font:'400 13px/1.55 var(--font-sans)',color:'#6b7280',margin:0}} dangerouslySetInnerHTML={{__html:s.d}}/>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
window.CaudalsHowItWorks = CaudalsHowItWorks;
