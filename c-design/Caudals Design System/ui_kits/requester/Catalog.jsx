// Catalog.jsx
function Catalog(){
  const [filter,setFilter] = React.useState('All');
  const cats = ['All','Logistics','E-commerce','Agriculture','Industrial','Healthcare','Finance'];
  const datasets = [
    {n:'Fleet GPS routes — Spain Q4',cat:'Logistics',org:'Northwind Data',rec:'840K records',fmt:'Parquet',price:'$24,000',status:'Available',kind:'success',grad:'linear-gradient(135deg,#cdeae0,#a7d4c5)'},
    {n:'Crop yield records 2020-25',cat:'Agriculture',org:'AgroSense',rec:'1.1M records',fmt:'JSON-Lines',price:'$11,500',status:'Closing soon',kind:'warn',grad:'linear-gradient(135deg,#fde68a,#f59e0b)'},
    {n:'Retail transaction patterns',cat:'E-commerce',org:'Loop Analytics',rec:'2.4M records',fmt:'Parquet',price:'$32,000',status:'Available',kind:'success',grad:'linear-gradient(135deg,#bfdbfe,#60a5fa)'},
    {n:'Warehouse picking traces',cat:'Logistics',org:'Pallet.io',rec:'540K records',fmt:'Parquet',price:'$18,400',status:'Available',kind:'success',grad:'linear-gradient(135deg,#fecaca,#fb7185)'},
    {n:'Manufacturing defect images',cat:'Industrial',org:'Foundrix',rec:'82K images',fmt:'TFRecord',price:'$41,000',status:'Available',kind:'success',grad:'linear-gradient(135deg,#e9d5ff,#a78bfa)'},
    {n:'Clinical trial metadata',cat:'Healthcare',org:'Trialscope',rec:'186K records',fmt:'Parquet',price:'$29,500',status:'Processing',kind:'neutral',grad:'linear-gradient(135deg,#ccfbf1,#5eead4)'},
  ];
  const shown = filter==='All'?datasets:datasets.filter(d=>d.cat===filter);
  return (
    <div style={{padding:'32px 40px'}}>
      <div style={{marginBottom:24}}>
        <Eyebrow>Catalog</Eyebrow>
        <h1 style={{font:'400 36px/1.1 var(--font-sans)',letterSpacing:'-.02em',color:'#000',margin:'6px 0 0'}}>Browse datasets</h1>
        <p style={{font:'400 14px var(--font-sans)',color:'#6b7280',margin:'10px 0 0'}}>{shown.length} datasets · updated 24 minutes ago</p>
      </div>
      <div style={{display:'flex',gap:8,marginBottom:24,flexWrap:'wrap'}}>
        {cats.map(c=>{
          const on = c===filter;
          return <button key={c} onClick={()=>setFilter(c)} style={{height:32,padding:'0 14px',borderRadius:9999,border:on?'1px solid #d1fae5':'1px solid #f3f4f6',background:on?'#ecfdf5':'#fff',color:on?'#047857':'#6b7280',font:'600 12px var(--font-sans)',cursor:'pointer'}}>{c}</button>;
        })}
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:18}}>
        {shown.map((d,i)=>(
          <div key={i} style={{background:'#fff',border:'1px solid #f3f4f6',borderRadius:14,overflow:'hidden',boxShadow:'0 1px 2px rgba(0,0,0,.04)'}}>
            <div style={{aspectRatio:'16/9',background:d.grad}}/>
            <div style={{padding:16}}>
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
                <Badge kind={d.kind}>{d.status}</Badge>
                <span style={{font:'700 10px var(--font-sans)',color:'#9ca3af',textTransform:'uppercase',letterSpacing:'.1em'}}>{d.cat}</span>
              </div>
              <h3 style={{font:'700 15px/1.3 var(--font-sans)',color:'#000',margin:'0 0 4px'}}>{d.n}</h3>
              <p style={{font:'500 12px var(--font-sans)',color:'#6b7280',margin:'0 0 12px'}}>{d.org}</p>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',paddingTop:12,borderTop:'1px solid #f3f4f6'}}>
                <div style={{font:'600 12px var(--font-mono)',color:'#6b7280'}}>{d.rec} · {d.fmt}</div>
                <div style={{font:'700 14px var(--font-sans)',color:'#000'}}>{d.price}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
window.Catalog = Catalog;
