import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { access, mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { textToSpeech } from "@workspace/integrations-openai-ai-server/audio";
import { findStudyModule } from "./study-content";

const exec = promisify(execFile);
type Chapter = NonNullable<ReturnType<typeof findStudyModule>>;
const xml = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);
function wrap(s: string, max = 42) {
  const lines: string[] = [];
  for (const word of s.split(/\s+/)) {
    if (!lines.length || lines[lines.length - 1]!.length + word.length + 1 > max) lines.push(word);
    else lines[lines.length - 1] += ` ${word}`;
  }
  return lines;
}
function svgText(s: string, x: number, y: number, size: number, color: string, max: number) {
  return `<text x="${x}" y="${y}" fill="${color}" font-size="${size}" font-family="sans-serif">${wrap(s, max).map((l, i) => `<tspan x="${x}" dy="${i ? size * 1.4 : 0}">${xml(l)}</tspan>`).join("")}</text>`;
}
export function chapterDiagram(chapter: Chapter) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="680" viewBox="0 0 1000 680" role="img"><title>${xml(chapter.title)}</title><desc>${xml(chapter.imageAlt)}</desc><rect width="1000" height="680" rx="28" fill="#f7f0e4"/><circle cx="940" cy="45" r="95" fill="#f0c659" opacity=".35"/><text x="46" y="48" font-family="sans-serif" font-size="14" fill="#c34827" letter-spacing="3">ADHYAAYAAN / FIELD GUIDE</text>${svgText(chapter.title,46,96,29,"#20264d",52)}${chapter.steps.map((step, i) => {
    const x = i % 2 === 0 ? 46 : 523, y = i < 2 ? 183 : 405;
    return `<rect x="${x}" y="${y}" width="431" height="194" rx="18" fill="${i % 2 === 0 ? "#173f42" : "#22284f"}"/><circle cx="${x + 36}" cy="${y + 36}" r="17" fill="#f0c659"/><text x="${x + 31}" y="${y + 42}" fill="#22284f" font-size="17" font-family="sans-serif">${i + 1}</text>${svgText(step.heading,x+66,y+43,23,"#fcf7ed",25)}${svgText(step.body,x+26,y+89,19,"#f5eee0",35)}`;
  }).join("")}<path d="M487 280 L510 280 M746 386 L746 399 M510 502 L487 502" stroke="#c34827" stroke-width="4" fill="none"/><text x="46" y="645" font-size="15" fill="#47565a" font-family="sans-serif">Read the idea. Try the process. Explain your reasoning.</text></svg>`;
}

// Reproducible instructional media: source lives with the lesson; rendered bytes are disposable.
// Never depend on the ephemeral cache for content durability or commit rendered video to Git.
const videos = new Map<string, Promise<string>>();
let renderQueue = Promise.resolve();
const mentorAvatar = path.resolve(process.cwd(), "assets", "mentor-avatar.png");
async function renderVideo(chapter: Chapter): Promise<string> {
  const script = [
    `Hi, I’m Adhya. Let’s work through ${chapter.title}.`,
    ...chapter.steps.map((step, index) => `${["First", "Next", "Then", "Finally"][index] ?? "Now"}, ${step.heading}. ${step.body}`),
    `Before you move on, pause and think: ${chapter.questions.understand}`,
    "Try to explain your reasoning in your own words. You can pause here and use the study coach whenever you are ready.",
  ].join(" ");
  const version = createHash("sha256").update(JSON.stringify(chapter.steps) + chapter.title + script + ":mentor-video-v3").digest("hex").slice(0, 16);
  const dir = path.join(tmpdir(), "adhyayaan-study-videos");
  await mkdir(dir, { recursive: true });
  const out = path.join(dir, `${chapter.id}-${version}.mp4`);
  try { await access(out); return out; } catch { /* Recreate missing disposable media. */ }
  const work = await mkdtemp(path.join(tmpdir(), "adhya-render-"));
  try {
    const files: string[] = [];
    const audioPath = path.join(work, "mentor-narration.mp3");
    const audio = await textToSpeech(script, "nova", "mp3");
    if (audio.byteLength < 1024) throw new Error("AI narration returned an empty audio track.");
    await writeFile(audioPath, audio);
    const durationResult = await exec("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", audioPath]);
    const duration = Number(durationResult.stdout.trim());
    if (!Number.isFinite(duration) || duration < 5) throw new Error("AI narration duration could not be read.");
    const sceneDuration = duration * 0.8 / chapter.steps.length;
    const addText = async (text: string, size: number, y: number, color: string, enable = "") => {
      const file = path.join(work, `text-${files.length}.txt`);
      await writeFile(file, text);
      files.push(`drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:textfile='${file}':expansion=none:fontcolor=${color}:fontsize=${size}:line_spacing=10:x=50:y=${y}${enable ? `:enable='${enable}'` : ""}`);
    };
    await addText("ADHYAAYAAN   /   ADHYA, YOUR LEARNING MENTOR", 14, 30, "0xe7bd55");
    await addText(wrap(chapter.title, 43).join("\n"), 26, 72, "0xfff8eb");
    for (const [i, step] of chapter.steps.entries()) {
      const start = (i * sceneDuration).toFixed(3);
      const end = ((i + 1) * sceneDuration).toFixed(3);
      const enable = `gte(t,${start})*lt(t,${end})`;
      files.push(`drawbox=x=38:y=144:w=496:h=254:color=0x111831@0.82:t=fill:enable='${enable}'`);
      await addText(`0${i + 1}   ${step.heading}`, 25, 177, "0xe7bd55", enable);
      await addText(wrap(step.body, 39).join("\n"), 18, 222, "0xfff8eb", enable);
      await addText("PAUSE & THINK", 13, 371, "0xbce2d8", enable);
    }
    const reflectAt = (sceneDuration * chapter.steps.length).toFixed(3);
    const reflectEnable = `gte(t,${reflectAt})`;
    files.push(`drawbox=x=38:y=144:w=496:h=254:color=0x111831@0.82:t=fill:enable='${reflectEnable}'`);
    await addText("PAUSE & THINK", 25, 181, "0xe7bd55", reflectEnable);
    await addText(wrap(chapter.questions.understand, 39).join("\n"), 18, 232, "0xfff8eb", reflectEnable);
    await addText("Explain your reasoning in your own words.", 13, 371, "0xbce2d8", reflectEnable);
    const filter = `[0:v]${files.join(",")}[scene];[1:v]scale=-2:310,format=rgba[mentor];[scene][mentor]overlay=x='548+7*sin(t*1.4)':y='148+5*sin(t*3)':format=auto[v]`;
    await exec("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y",
      "-f", "lavfi", "-i", `color=c=0x20264d:s=854x480:r=24:d=${duration}`,
      "-i", mentorAvatar, "-i", audioPath, "-filter_complex", filter, "-map", "[v]", "-map", "2:a",
      "-shortest", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "25", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", out],
    { timeout: 60_000, maxBuffer: 1024 * 1024 });
    return out;
  } catch (error) {
    await rm(out, { force: true });
    throw error;
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
export async function chapterVideo(chapter: Chapter) {
  let job = videos.get(chapter.id);
  if (!job) {
    job = renderQueue.then(() => renderVideo(chapter));
    renderQueue = job.then(() => undefined, () => undefined);
    videos.set(chapter.id, job);
    job.catch(() => videos.delete(chapter.id));
  }
  return job;
}
