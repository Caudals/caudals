// Header.jsx — Caudals marketing header
function CaudalsHeader({ scrolled = true }) {
  return (
    <header style={{
      position:'sticky',top:0,zIndex:50,width:'100%',
      borderBottom: scrolled ? '1px solid rgba(255,255,255,0.35)' : '1px solid transparent',
      background: scrolled ? 'rgba(255,255,255,0.4)' : 'transparent',
      backdropFilter: scrolled ? 'blur(22px)' : 'none',
      boxShadow: scrolled ? '0 18px 40px -30px rgba(15,23,42,0.32)' : 'none',
      transition:'all .3s'
    }}>
      <div style={{maxWidth:1280,margin:'0 auto',height:64,display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 48px'}}>
        <a href="#" style={{display:'flex',alignItems:'center',gap:10,textDecoration:'none'}}>
          <img src="../../assets/caudals_logo_black.svg" style={{width:28,height:28}} alt=""/>
          <span style={{font:'500 20px/1 var(--font-sans)',letterSpacing:'-.02em',color:'#000'}}>Caudals</span>
        </a>
        <nav style={{display:'flex',alignItems:'center',gap:40}}>
          {['Browse','Contact','Blog','Trust'].map(l=>(
            <a key={l} href="#" style={{font:'500 14px var(--font-sans)',color:'#6b7280',textDecoration:'none'}}>{l}</a>
          ))}
          <div style={{height:24,width:1,background:'#f3f4f6',marginLeft:16}}/>
          <button style={{height:36,padding:'0 20px',borderRadius:6,border:'1px solid #e5e7eb',background:'#fff',color:'#000',font:'600 13px var(--font-sans)',cursor:'pointer'}}>Sign in</button>
          <button style={{height:36,padding:'0 20px',borderRadius:6,border:0,background:'#000',color:'#fff',font:'600 13px var(--font-sans)',cursor:'pointer'}}>Sign up</button>
        </nav>
      </div>
    </header>
  );
}
window.CaudalsHeader = CaudalsHeader;
