// Dashboard.jsx
function Dashboard(){
  const requests = [
    {n:'Fleet GPS routes — Spain Q4',s:'Sample ready',kind:'info',p:'Logistics · 840K records',eta:'Due in 3 days'},
    {n:'Retail transaction patterns',s:'Delivered',kind:'success',p:'E-commerce · 2.4M records',eta:'2 days ago'},
    {n:'Crop yield records 2020-25',s:'Processing',kind:'warn',p:'Agriculture · 1.1M records',eta:'Due in 8 days'},
    {n:'Manufacturing defect images',s:'Scoping',kind:'neutral',p:'Industrial · pending',eta:'Scope call tomorrow'},
  ];
  return (
    <div style={{padding:'32px 40px',maxWidth:1280}}>
      <div style={{marginBottom:28}}>
        <Eyebrow>Overview</Eyebrow>
        <h1 style={{font:'400 36px/1.1 var(--font-sans)',letterSpacing:'-.02em',color:'#000',margin:'6px 0 0'}}>Good morning, Ana</h1>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14,marginBottom:32}}>
        <StatCard label="Active requests" value="4" delta="+1 this week"/>
        <StatCard label="Datasets delivered" value="12"/>
        <StatCard label="Avg. delivery time" value="9d" accent="#047857"/>
        <StatCard label="Spend · 30d" value="$48.2k"/>
      </div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
        <h2 style={{font:'700 13px var(--font-sans)',color:'#000',textTransform:'uppercase',letterSpacing:'.12em',margin:0}}>Your requests</h2>
        <Btn variant="outline" size="sm">View all</Btn>
      </div>
      <div style={{border:'1px solid #f3f4f6',borderRadius:12,overflow:'hidden'}}>
        <div style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr 140px',gap:16,padding:'10px 20px',background:'#f9fafb',borderBottom:'1px solid #f3f4f6',font:'700 10px var(--font-sans)',color:'#9ca3af',textTransform:'uppercase',letterSpacing:'.12em'}}>
          <span>Dataset</span><span>Status</span><span>Timeline</span><span style={{textAlign:'right'}}></span>
        </div>
        {requests.map((r,i)=>(
          <div key={i} style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr 140px',gap:16,padding:'16px 20px',alignItems:'center',borderTop:i?'1px solid #f3f4f6':'none'}}>
            <div><div style={{font:'700 14px var(--font-sans)',color:'#000',marginBottom:3}}>{r.n}</div><div style={{font:'500 12px var(--font-sans)',color:'#6b7280'}}>{r.p}</div></div>
            <div><Badge kind={r.kind}>{r.s}</Badge></div>
            <div style={{font:'500 13px var(--font-sans)',color:'#6b7280'}}>{r.eta}</div>
            <div style={{textAlign:'right'}}><Btn variant="outline" size="sm">Open</Btn></div>
          </div>
        ))}
      </div>
    </div>
  );
}
window.Dashboard = Dashboard;
