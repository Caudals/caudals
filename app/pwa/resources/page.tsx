const playbooks = [
  {
    title: "Capture best practices",
    items: [
      "Lock focus and exposure before recording visual data.",
      "Avoid overlays such as timestamps or stickers unless requested.",
      "Log contextual metadata (location, device, scenario) in your notes.",
    ],
  },
  {
    title: "Audio & speech",
    items: [
      "Use headphones or an external mic to remove handling noise.",
      "Record in a quiet indoor environment with doors and windows closed.",
      "Hold the microphone 15cm away from the source for consistent gain.",
    ],
  },
  {
    title: "Labeling & text",
    items: [
      "Keep tone neutral when paraphrasing customer sentiment.",
      "Double-check spelling, grammar, and entity names before submitting.",
      "Use the notes field to flag edge cases that need reviewer attention.",
    ],
  },
];

const workflow = [
  {
    title: "Plan",
    detail:
      "Review the dataset brief, understand acceptance criteria, and pin any reference prompts before heading into the field.",
  },
  {
    title: "Capture",
    detail:
      "Use your preferred camera, voice recorder, or file explorer. The PWA will queue uploads if your connection drops.",
  },
  {
    title: "Upload",
    detail:
      "Return to the Upload center inside the brief to attach files, add metadata, and submit for validation.",
  },
];

export default function PwaResourcesPage() {
  return (
    <div className="space-y-5 pb-16 text-white">
      <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/15 to-white/0 p-5 shadow-[0_12px_30px_rgba(8,15,40,0.4)]">
        <p className="text-xs uppercase tracking-[0.3em] text-white/60">
          Contributor playbook
        </p>
        <h2 className="mt-1 text-2xl font-semibold">
          Make every sample reviewer-ready
        </h2>
        <p className="text-sm text-white/70">
          These quick reminders help keep approval rates high across every data
          type we host on Caudals.
        </p>
      </section>

      <section className="space-y-4">
        {playbooks.map((playbook) => (
          <article
            key={playbook.title}
            className="rounded-3xl border border-white/10 bg-white/5 p-5"
          >
            <h3 className="text-lg font-semibold">{playbook.title}</h3>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-white/80">
              {playbook.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
        ))}
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/5 p-5">
        <h3 className="text-lg font-semibold">Upload workflow</h3>
        <div className="mt-4 space-y-4">
          {workflow.map((step, index) => (
            <div
              key={step.title}
              className="rounded-2xl border border-white/10 bg-black/10 px-4 py-3"
            >
              <p className="text-xs uppercase tracking-[0.3em] text-white/50">
                Step {index + 1}
              </p>
              <p className="font-semibold">{step.title}</p>
              <p className="text-sm text-white/70">{step.detail}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
