export function StatsSection() {
  const stats = [
    {
      value: "10M+",
      label: "Data points collected",
      description: "Across all modalities",
    },
    {
      value: "50K+",
      label: "Active contributors",
      description: "In 120+ countries",
    },
    {
      value: "95%",
      label: "Quality score",
      description: "Average submission quality",
    },
    {
      value: "48hrs",
      label: "Average turnaround",
      description: "From launch to first data",
    },
  ];

  return (
    <section className="relative py-24">
      <div className="mx-auto max-w-6xl px-6 sm:px-8 lg:px-12">
        <div className="rounded-[2rem] border border-border/50 bg-gradient-to-br from-white to-slate-50/50 p-12 shadow-xl backdrop-blur-sm">
          <div className="mb-12 text-center">
            <h2 className="mb-4 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              Trusted by leading teams
            </h2>
            <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
              Join hundreds of companies using Collective to build
              production-grade datasets
            </p>
          </div>

          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="mb-2 bg-gradient-to-br from-primary to-primary/70 bg-clip-text text-4xl font-bold text-transparent sm:text-5xl">
                  {stat.value}
                </div>
                <div className="mb-1 font-semibold text-slate-900">
                  {stat.label}
                </div>
                <div className="text-sm text-muted-foreground">
                  {stat.description}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
