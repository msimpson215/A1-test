import { redirect } from "next/navigation";

// redirect() cannot run in a static export, so that build gets a link instead.
const staticExport = process.env.DEMO_EXPORT === "1";

export default function Home() {
  if (!staticExport) {
    redirect("/dierbergs-demo");
  }

  return (
    <main style={{ padding: "64px", fontFamily: "system-ui, sans-serif" }}>
      <a href="./dierbergs-demo/">Open the AXON &times; Dierbergs demo</a>
    </main>
  );
}
