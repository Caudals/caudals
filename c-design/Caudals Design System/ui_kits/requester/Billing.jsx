// Billing.jsx
function Billing(){
  const invoices = [
    {d:'INV-2026-018',for:'Retail transaction patterns',date:'Apr 12, 2026',amt:'$32,000',s:'Paid',kind:'success'},
    {d:'INV-2026-017',for:'Fleet GPS — Spain Q4',date:'Apr 04, 2026',amt:'$24,000',s:'Paid',kind:'success'},
    {d:'INV-2026-016',for:'Warehouse picking traces',date:'Mar 28, 2026',amt:'$18,400',s:'Due Apr 30',kind:'warn'},
    {d:'INV-2026-014',for:'Loyalty program logs',date:'Mar 11, 2026',amt:'$9,200',s:'Paid',kind:'success'},
  ];
  return (
    <div style={{padding:'32px 40px'}}>
      <Eyebrow>Billing</Eyebrow>
      <h1 style={{font:'400 36px/1.1 var(--font-sans)',letterSpacing:'-.02em',color:'#000',margin:'6px 0 24px'}}>Spend &amp; invoices</h1>
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14,marginBottom:32}}>
        <StatCard label="Spend · MTD" value="$48.2k"/>
        <StatCard label="Spend · YTD" value="$186k"/>
        <StatCard label="Outstanding" value="$18.4k" accent="#92400e"/>
        <StatCard label="Avg. invoice" value="$21.6k"/>
      </div>
      <h2 style={{font:'700 13px var(--font-sans)',color:'#000',textTransform:'uppercase',letterSpacing:'.12em',margin:'0 0 14px'}}>Invoices</h2>
      <div style={{border:'1px solid #f3f4f6',borderRadius:12,overflow:'hidden'}}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 2fr 1fr 1fr 1fr',gap:16,padding:'10px 20px',background:'#f9fafb',borderBottom:'1px solid #f3f4f6',font:'700 10px var(--font-sans)',color:'#9ca3af',textTransform:'uppercase',letterSpacing:'.12em'}}>
          <span>Invoice</span><span>Dataset</span><span>Date</span><span style={{textAlign:'right'}}>Amount</span><span style={{textAlign:'right'}}>Status</span>
        </div>
        {invoices.map((r,i)=>(
          <div key={i} style={{display:'grid',gridTemplateColumns:'1fr 2fr 1fr 1fr 1fr',gap:16,padding:'14px 20px',alignItems:'center',borderTop:i?'1px solid #f3f4f6':'none'}}>
            <div style={{font:'600 12px var(--font-mono)',color:'#000'}}>{r.d}</div>
            <div style={{font:'600 13px var(--font-sans)',color:'#000'}}>{r.for}</div>
            <div style={{font:'500 12px var(--font-sans)',color:'#6b7280'}}>{r.date}</div>
            <div style={{font:'700 13px var(--font-sans)',color:'#000',textAlign:'right',fontVariantNumeric:'tabular-nums'}}>{r.amt}</div>
            <div style={{textAlign:'right'}}><Badge kind={r.kind}>{r.s}</Badge></div>
          </div>
        ))}
      </div>
    </div>
  );
}
window.Billing = Billing;
