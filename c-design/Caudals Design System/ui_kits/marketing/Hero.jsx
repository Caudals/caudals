// Hero.jsx — Caudals hero w/ glass preview console
function CaudalsHero(){
  return (
    <section style={{position:'relative',minHeight:'90vh',background:'#fff',padding:'80px 48px 120px',display:'flex',alignItems:'center',justifyContent:'center',overflow:'hidden'}}>
      <div style={{position:'absolute',inset:0,background:'radial-gradient(60% 50% at 50% 35%, rgba(209,250,229,0.6), transparent 70%)',opacity:.85,pointerEvents:'none'}}/>
      <div style={{position:'absolute',bottom:0,left:0,right:0,height:192,background:'linear-gradient(to top,#fff,transparent)',zIndex:2,pointerEvents:'none'}}/>
      <div style={{position:'relative',zIndex:10,maxWidth:1080,width:'100%',display:'flex',flexDirection:'column',alignItems:'center',textAlign:'center'}}>
        <div style={{display:'inline-flex',alignItems:'center',gap:8,padding:'6px 16px',borderRadius:6,background:'rgba(255,255,255,.4)',border:'1px solid rgba(204,251,241,.4)',backdropFilter:'blur(12px)',boxShadow:'0 1px 2px rgba(0,0,0,.05)',font:'700 13px var(--font-sans)',color:'#0f5e4a',marginBottom:24}}>
          <span style={{width:6,height:6,borderRadius:9999,background:'#0d9488'}}/>
          B2B data marketplace for AI teams
        </div>
        <h1 style={{font:'400 80px/1.05 var(--font-sans)',letterSpacing:'-.03em',color:'#000',margin:0,maxWidth:900}}>
          Professional datasets for AI{' '}
          <span style={{font:'italic 400 1em/1 "New York","Iowa",Georgia,serif',color:'rgba(15,118,110,.9)'}}>tailored</span>
        </h1>
        <p style={{font:'400 20px/1.55 var(--font-sans)',color:'#6b7280',marginTop:24,maxWidth:640}}>
          We source, process, and deliver ML-ready datasets so your team can build models faster.
        </p>
        <div style={{position:'relative',display:'flex',alignItems:'center',marginTop:40,maxWidth:440,width:'100%'}}>
          <input placeholder="Enter your work email" style={{flex:1,height:48,borderRadius:9999,border:'1px solid rgba(229,231,235,.8)',background:'rgba(255,255,255,.6)',padding:'0 130px 0 20px',font:'400 14px var(--font-sans)',outline:'none',boxShadow:'0 1px 2px rgba(0,0,0,.05)'}}/>
          <button style={{position:'absolute',right:4,height:40,padding:'0 20px',borderRadius:9999,border:0,background:'#000',color:'#fff',font:'700 13px var(--font-sans)',cursor:'pointer'}}>Request access</button>
        </div>
        <div style={{display:'flex',gap:40,marginTop:40,fontSize:14,color:'#111'}}>
          {['Enterprise-grade processing','GDPR-compliant pipelines','Revenue share for suppliers'].map(t=>(
            <div key={t} style={{display:'flex',alignItems:'center',gap:10}}>
              <span style={{width:6,height:6,borderRadius:9999,background:'rgba(13,148,136,.4)'}}/>
              <span style={{font:'500 14px var(--font-sans)'}}>{t}</span>
            </div>
          ))}
        </div>
        <ConsolePreview/>
      </div>
    </section>
  );
}

function ConsolePreview(){
  return (
    <div style={{marginTop:64,width:'100%',maxWidth:1080,background:'rgba(255,255,255,.72)',backdropFilter:'blur(40px)',border:'1px solid rgba(229,231,235,.6)',borderRadius:14,padding:4,boxShadow:'0 48px 120px -56px rgba(15,23,42,.62)',textAlign:'left'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'14px 24px',borderBottom:'1px solid #f3f4f6'}}>
        <div style={{display:'flex',alignItems:'center',gap:16}}>
          <div style={{display:'flex',gap:6}}>{[1,2,3].map(i=><div key={i} style={{width:10,height:10,borderRadius:9999,background:'#d1d5db'}}/>)}</div>
          <span style={{font:'700 11px var(--font-sans)',color:'#9ca3af',textTransform:'uppercase',letterSpacing:'.12em'}}>Data Marketplace Console</span>
        </div>
        <div style={{display:'inline-flex',alignItems:'center',gap:6,padding:'4px 8px',borderRadius:6,background:'#ecfdf5'}}>
          <span style={{width:4,height:4,borderRadius:9999,background:'#0d9488'}}/>
          <span style={{font:'700 10px var(--font-sans)',color:'#065f46',textTransform:'uppercase'}}>Live</span>
        </div>
      </div>
      <div style={{display:'flex'}}>
        <aside style={{width:200,padding:20,borderRight:'1px solid #f3f4f6'}}>
          <div style={{font:'700 10px var(--font-sans)',color:'#9ca3af',textTransform:'uppercase',letterSpacing:'.12em',marginBottom:12}}>Workspace</div>
          {['Dashboard','Catalog','Processing','Billing','Settings'].map((n,i)=>(
            <div key={n} style={{height:30,display:'flex',alignItems:'center',padding:'0 10px',borderRadius:6,marginBottom:4,background:i===0?'#ecfdf5':'transparent',color:i===0?'#047857':'#6b7280',font:'700 12px var(--font-sans)',border:i===0?'1px solid #d1fae5':'1px solid transparent'}}>{n}</div>
          ))}
        </aside>
        <main style={{flex:1,padding:32}}>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:16,marginBottom:32}}>
            {[
              {l:'Supplier Companies',v:'142',d:'+18%',c:'#000'},
              {l:'Data Quality Score',v:'98.4%',d:'+0.6%',c:'#047857'},
              {l:'Datasets Delivered',v:'1,284',d:'+24%',c:'#000'}
            ].map(s=>(
              <div key={s.l} style={{padding:18,border:'1px solid #f3f4f6',borderRadius:12,background:'rgba(249,250,251,.4)'}}>
                <div style={{font:'700 10px var(--font-sans)',color:'#9ca3af',textTransform:'uppercase',letterSpacing:'.12em',marginBottom:6}}>{s.l}</div>
                <div style={{display:'flex',alignItems:'baseline',gap:8}}>
                  <span style={{font:'400 22px var(--font-sans)',letterSpacing:'-.02em',color:s.c,fontVariantNumeric:'tabular-nums'}}>{s.v}</span>
                  <span style={{font:'700 10px var(--font-sans)',color:'#047857'}}>{s.d}</span>
                </div>
              </div>
            ))}
          </div>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
            <h3 style={{font:'700 13px var(--font-sans)',color:'#000',textTransform:'uppercase',letterSpacing:'.12em',margin:0}}>Available Datasets</h3>
          </div>
          <div style={{border:'1px solid #f3f4f6',borderRadius:12,overflow:'hidden'}}>
            <div style={{display:'grid',gridTemplateColumns:'1.5fr 1fr 1fr 1fr',gap:16,padding:'10px 20px',background:'rgba(249,250,251,.5)',borderBottom:'1px solid #f3f4f6',font:'700 10px var(--font-sans)',color:'#9ca3af',textTransform:'uppercase',letterSpacing:'.12em'}}>
              <span>Dataset</span><span style={{textAlign:'center'}}>Industry</span><span style={{textAlign:'right'}}>Records</span><span style={{textAlign:'right'}}>Status</span>
            </div>
            {[
              {n:'Retail Transaction Patterns',t:'E-commerce',v:'2.4M',s:'Available'},
              {n:'Fleet GPS Routes — Spain',t:'Logistics',v:'840K',s:'Processing'},
              {n:'Crop Yield Records 2020-25',t:'Agriculture',v:'1.1M',s:'Available'},
            ].map((r,i)=>(
              <div key={i} style={{display:'grid',gridTemplateColumns:'1.5fr 1fr 1fr 1fr',gap:16,padding:'14px 20px',alignItems:'center',borderTop:i?'1px solid #f3f4f6':'none'}}>
                <div style={{display:'flex',alignItems:'center',gap:10}}><span style={{width:8,height:8,borderRadius:9999,background:'#10b981'}}/><span style={{font:'700 13px var(--font-sans)',color:'#000'}}>{r.n}</span></div>
                <div style={{font:'500 11px var(--font-sans)',color:'#6b7280',textAlign:'center'}}>{r.t}</div>
                <div style={{font:'700 11px var(--font-mono)',color:'#000',textAlign:'right'}}>{r.v}</div>
                <div style={{textAlign:'right'}}><span style={{padding:'4px 8px',borderRadius:6,font:'700 10px var(--font-sans)',textTransform:'uppercase',letterSpacing:'.1em',background:r.s==='Available'?'#ecfdf5':'#f3f4f6',color:r.s==='Available'?'#047857':'#6b7280'}}>{r.s}</span></div>
              </div>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
window.CaudalsHero = CaudalsHero;
