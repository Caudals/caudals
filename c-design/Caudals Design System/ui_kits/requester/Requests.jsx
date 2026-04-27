// Requests.jsx — intake form + list
function Requests(){
  const [submitted,setSubmitted] = React.useState(false);
  const active = [
    {n:'Fleet GPS routes — Spain Q4',s:'Sample ready',kind:'info',desc:'840K rows across 840 vehicles · Dec 2025',step:3},
    {n:'Crop yield records 2020-25',s:'Processing',kind:'warn',desc:'Waiting on 2 of 6 supplier anonymization packets',step:2},
    {n:'Manufacturing defect images',s:'Scoping',kind:'neutral',desc:'Initial scope call scheduled Wed',step:1},
  ];
  return (
    <div style={{padding:'32px 40px',display:'grid',gridTemplateColumns:'1.1fr 1.4fr',gap:32,alignItems:'start'}}>
      <div style={{background:'#f9fafb',border:'1px solid #f3f4f6',borderRadius:14,padding:24}}>
        <Eyebrow>New request</Eyebrow>
        <h2 style={{font:'400 24px/1.2 var(--font-sans)',letterSpacing:'-.02em',color:'#000',margin:'6px 0 20px'}}>What data do you need?</h2>
        <div style={{display:'flex',flexDirection:'column',gap:14}}>
          <Field label="Dataset title" placeholder="e.g. Fleet GPS routes — UK Q1" defaultValue="Retail transactions — DACH Q1"/>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <Field label="Industry" defaultValue="E-commerce"/>
            <Field label="Volume" defaultValue="1M+ records"/>
          </div>
          <label><div style={{font:'600 13px var(--font-sans)',color:'#000',marginBottom:6}}>Description</div>
            <textarea rows="3" defaultValue="Anonymized POS transactions across DACH region for Q1 2026. Need: timestamp, SKU, category, price, store type."
              style={{width:'100%',boxSizing:'border-box',font:'400 14px/1.4 var(--font-sans)',padding:'9px 12px',border:'1px solid #e5e7eb',background:'#fff',borderRadius:6,outline:'none',boxShadow:'0 1px 2px rgba(0,0,0,.05)',resize:'vertical'}}/>
          </label>
          <div style={{display:'flex',gap:10,alignItems:'center',paddingTop:8}}>
            <Btn onClick={()=>setSubmitted(true)}>Submit request</Btn>
            <Btn variant="ghost">Save draft</Btn>
            {submitted && <Badge kind="success">✓ Submitted — we'll respond in 24h</Badge>}
          </div>
        </div>
      </div>
      <div>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
          <h2 style={{font:'700 13px var(--font-sans)',color:'#000',textTransform:'uppercase',letterSpacing:'.12em',margin:0}}>Active requests</h2>
          <Badge kind="neutral">{active.length} in flight</Badge>
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          {active.map((r,i)=>(
            <div key={i} style={{padding:20,border:'1px solid #f3f4f6',borderRadius:14,background:'#fff'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:12}}>
                <div>
                  <h3 style={{font:'700 15px var(--font-sans)',color:'#000',margin:'0 0 4px'}}>{r.n}</h3>
                  <p style={{font:'500 12px var(--font-sans)',color:'#6b7280',margin:0}}>{r.desc}</p>
                </div>
                <Badge kind={r.kind}>{r.s}</Badge>
              </div>
              <div style={{display:'flex',gap:4,marginTop:10}}>
                {['Scoping','Sourcing','Sample','Delivery'].map((p,pi)=>(
                  <div key={p} style={{flex:1,textAlign:'center'}}>
                    <div style={{height:3,borderRadius:9999,background:pi<r.step?'#059669':pi===r.step?'#d1fae5':'#f3f4f6'}}/>
                    <div style={{font:'600 10px var(--font-sans)',color:pi<=r.step?'#000':'#9ca3af',marginTop:6,textTransform:'uppercase',letterSpacing:'.08em'}}>{p}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
window.Requests = Requests;
