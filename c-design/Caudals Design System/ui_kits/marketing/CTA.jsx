// CTA.jsx + Footer.jsx
function CaudalsCTA(){
  return (
    <section style={{padding:'120px 48px',background:'#fff',textAlign:'center'}}>
      <div style={{maxWidth:720,margin:'0 auto'}}>
        <h2 style={{font:'400 56px/1.05 var(--font-sans)',letterSpacing:'-.03em',color:'#000',margin:0}}>
          Stop waiting on data. <span style={{font:'italic 400 1em "New York","Iowa",Georgia,serif',color:'rgba(15,118,110,.9)'}}>Start building.</span>
        </h2>
        <p style={{font:'400 19px/1.55 var(--font-sans)',color:'#6b7280',margin:'24px 0 40px'}}>
          Request access and we'll scope your first dataset within 24 hours.
        </p>
        <div style={{display:'flex',gap:12,justifyContent:'center',flexWrap:'wrap'}}>
          <button style={{height:52,padding:'0 32px',borderRadius:9999,border:0,background:'#000',color:'#fff',font:'700 15px var(--font-sans)',cursor:'pointer',display:'inline-flex',alignItems:'center',gap:10}}>I need a dataset <span>→</span></button>
          <button style={{height:52,padding:'0 32px',borderRadius:9999,border:'1px solid #e5e7eb',background:'#fff',color:'#000',font:'700 15px var(--font-sans)',cursor:'pointer'}}>I want to sell data</button>
        </div>
      </div>
    </section>
  );
}

function CaudalsFooter(){
  const cols = [
    {h:'Product',l:['Browse catalog','Request data','For suppliers','Pricing']},
    {h:'Company',l:['About','Blog','Careers','Press']},
    {h:'Resources',l:['Documentation','Trust & Security','Compliance','Changelog']},
    {h:'Legal',l:['Terms','Privacy','Data usage','Cookies']},
  ];
  return (
    <footer style={{background:'#0a0a0a',color:'#fff',padding:'80px 48px 32px'}}>
      <div style={{maxWidth:1200,margin:'0 auto'}}>
        <div style={{display:'grid',gridTemplateColumns:'1.4fr repeat(4,1fr)',gap:48,paddingBottom:56,borderBottom:'1px solid rgba(255,255,255,.08)'}}>
          <div>
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:16}}>
              <img src="../../assets/caudals_logo_white.svg" style={{width:28,height:28}} alt=""/>
              <span style={{font:'500 20px var(--font-sans)',letterSpacing:'-.02em'}}>Caudals</span>
            </div>
            <p style={{font:'400 14px/1.6 var(--font-sans)',color:'rgba(255,255,255,.55)',margin:0,maxWidth:280}}>
              B2B data marketplace. We source, process, and deliver datasets so your team can build AI faster.
            </p>
          </div>
          {cols.map(c=>(
            <div key={c.h}>
              <div style={{font:'700 11px var(--font-sans)',color:'rgba(255,255,255,.5)',textTransform:'uppercase',letterSpacing:'.12em',marginBottom:18}}>{c.h}</div>
              {c.l.map(l=>(
                <a key={l} href="#" style={{display:'block',font:'500 14px/2.2 var(--font-sans)',color:'rgba(255,255,255,.8)',textDecoration:'none'}}>{l}</a>
              ))}
            </div>
          ))}
        </div>
        <div style={{paddingTop:28,display:'flex',justifyContent:'space-between',alignItems:'center',fontSize:13,color:'rgba(255,255,255,.5)'}}>
          <div>© 2026 Caudals. Based in Barcelona &amp; New York.</div>
          <div style={{display:'flex',gap:20}}>
            {['Twitter','LinkedIn','GitHub'].map(s=><a key={s} href="#" style={{color:'rgba(255,255,255,.7)',textDecoration:'none',font:'500 13px var(--font-sans)'}}>{s}</a>)}
          </div>
        </div>
      </div>
    </footer>
  );
}
window.CaudalsCTA = CaudalsCTA;
window.CaudalsFooter = CaudalsFooter;
