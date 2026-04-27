// Primitives.jsx — shared atoms
const colors = { emerald:'#059669', emeraldBg:'#ecfdf5', emeraldBorder:'#d1fae5', emeraldDark:'#047857',
  amber:'#92400e', amberBg:'#fffbeb', amberBorder:'#fde68a',
  blue:'#1d4ed8', blueBg:'#eff6ff', blueBorder:'#dbeafe',
  border:'#f3f4f6', strongBorder:'#e5e7eb', fg1:'#000', fg2:'#6b7280', fg3:'#9ca3af', surface:'#f9fafb' };

function Btn({variant='primary',size='md',children,...p}){
  const sizes = {sm:{h:30,pad:'0 12px',fs:12},md:{h:36,pad:'0 16px',fs:13},lg:{h:44,pad:'0 22px',fs:14}}[size];
  const variants = {
    primary:{background:'#000',color:'#fff',border:0},
    outline:{background:'#fff',color:'#000',border:'1px solid #e5e7eb'},
    ghost:{background:'transparent',color:'#000',border:0},
  }[variant];
  return <button {...p} style={{height:sizes.h,padding:sizes.pad,borderRadius:6,font:`600 ${sizes.fs}px var(--font-sans)`,cursor:'pointer',display:'inline-flex',alignItems:'center',gap:8,...variants,...(p.style||{})}}>{children}</button>;
}

function Badge({kind='neutral',children}){
  const styles = {
    success:{background:colors.emeraldBg,color:colors.emeraldDark},
    warn:{background:colors.amberBg,color:colors.amber},
    info:{background:colors.blueBg,color:colors.blue},
    neutral:{background:'#f3f4f6',color:'#374151'},
    outline:{background:'#fff',color:'#000',border:'1px solid #e5e7eb'},
  }[kind];
  return <span style={{display:'inline-flex',alignItems:'center',gap:6,padding:'3px 9px',borderRadius:6,font:'600 11px/1.4 var(--font-sans)',...styles}}>{children}</span>;
}

function StatCard({label,value,delta,accent}){
  return (
    <div style={{padding:18,border:'1px solid #f3f4f6',borderRadius:12,background:colors.surface}}>
      <div style={{font:'700 10px var(--font-sans)',color:colors.fg3,textTransform:'uppercase',letterSpacing:'.12em',marginBottom:8}}>{label}</div>
      <div style={{display:'flex',alignItems:'baseline',gap:8}}>
        <span style={{font:'400 28px/1 var(--font-sans)',letterSpacing:'-.02em',color:accent||'#000',fontVariantNumeric:'tabular-nums'}}>{value}</span>
        {delta && <span style={{font:'700 11px var(--font-sans)',color:colors.emerald}}>{delta}</span>}
      </div>
    </div>
  );
}

function Eyebrow({children}){return <div style={{font:'700 10px var(--font-sans)',color:colors.fg3,textTransform:'uppercase',letterSpacing:'.12em'}}>{children}</div>;}

function Field({label,...p}){
  return (
    <label style={{display:'block'}}>
      <div style={{font:'600 13px/1 var(--font-sans)',color:'#000',marginBottom:6}}>{label}</div>
      <input {...p} style={{width:'100%',boxSizing:'border-box',font:'400 14px/1.4 var(--font-sans)',padding:'9px 12px',border:'1px solid #e5e7eb',background:'#fff',borderRadius:6,outline:'none',color:'#000',boxShadow:'0 1px 2px rgba(0,0,0,.05)',...p.style}}/>
    </label>
  );
}

Object.assign(window,{Btn,Badge,StatCard,Eyebrow,Field,cau_colors:colors});
