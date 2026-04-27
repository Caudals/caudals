// AppShell.jsx — sidebar + topbar
function AppShell({active,onNav,children}){
  const items = [
    {k:'dashboard',l:'Dashboard',ic:'▤'},
    {k:'catalog',l:'Catalog',ic:'▦'},
    {k:'requests',l:'Requests',ic:'☰'},
    {k:'billing',l:'Billing',ic:'$'},
  ];
  return (
    <div style={{display:'flex',minHeight:'100vh',background:'#fff',fontFamily:'var(--font-sans)'}}>
      <aside style={{width:236,background:'#f9fafb',borderRight:'1px solid #f3f4f6',padding:'20px 14px',flexShrink:0,display:'flex',flexDirection:'column'}}>
        <div style={{display:'flex',alignItems:'center',gap:10,padding:'6px 8px',marginBottom:20}}>
          <img src="../../assets/caudals_logo_black.svg" style={{width:24,height:24}}/>
          <span style={{font:'500 17px var(--font-sans)',letterSpacing:'-.01em',color:'#000'}}>Caudals</span>
        </div>
        <div style={{font:'700 10px var(--font-sans)',color:'#9ca3af',textTransform:'uppercase',letterSpacing:'.12em',padding:'0 10px',marginBottom:8}}>Workspace</div>
        <nav style={{display:'flex',flexDirection:'column',gap:2}}>
          {items.map(it => {
            const on = it.k===active;
            return (
              <button key={it.k} onClick={()=>onNav(it.k)} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 10px',borderRadius:8,font:'600 13px var(--font-sans)',background:on?'#ecfdf5':'transparent',color:on?'#047857':'#6b7280',border:on?'1px solid #d1fae5':'1px solid transparent',cursor:'pointer',textAlign:'left'}}>
                <span style={{width:14,display:'inline-block',color:on?'#047857':'#9ca3af'}}>{it.ic}</span>
                {it.l}
              </button>
            );
          })}
        </nav>
        <div style={{marginTop:'auto',padding:12,borderRadius:10,background:'#fff',border:'1px solid #f3f4f6'}}>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <div style={{width:32,height:32,borderRadius:8,background:'#111',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',font:'700 12px var(--font-sans)'}}>AR</div>
            <div>
              <div style={{font:'600 13px var(--font-sans)',color:'#000'}}>Ana Reyes</div>
              <div style={{font:'500 11px var(--font-sans)',color:'#9ca3af'}}>Northwind Data</div>
            </div>
          </div>
        </div>
      </aside>
      <main style={{flex:1,display:'flex',flexDirection:'column',minWidth:0}}>
        <div style={{height:60,borderBottom:'1px solid #f3f4f6',display:'flex',alignItems:'center',padding:'0 32px',justifyContent:'space-between'}}>
          <div style={{font:'600 13px var(--font-sans)',color:'#9ca3af'}}>Requester · Workspace</div>
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <Btn variant="outline" size="sm">Docs</Btn>
            <Btn size="sm">New request</Btn>
          </div>
        </div>
        <div style={{flex:1,overflow:'auto'}}>{children}</div>
      </main>
    </div>
  );
}
window.AppShell = AppShell;
