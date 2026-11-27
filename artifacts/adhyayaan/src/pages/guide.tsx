import { useState } from "react";
import {
  useConfigureGuide,
  useGetGuidePool,
  useGetGuideWorkspace,
  useListCourses,
  type GuidePoolEntry,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { errMsg, statusLabel, useAuth, useTitle } from "@/lib/app";

function difference(hours: number) {
  return hours === 0
    ? "On schedule"
    : `${Math.abs(hours)} planned hours ${hours > 0 ? "ahead" : "behind"}`;
}
export function GuideWorkspace() {
  useTitle("Internship guide");
  const { user } = useAuth();
  const [course, setCourse] = useState("");
  const q = useGetGuideWorkspace({ query: { enabled: !!user?.isGuide } });
  if (!user?.isGuide) return <p>Internship guide access required.</p>;
  if (q.isError) return <p role="alert">{errMsg(q.error)}</p>;
  if (!q.data) return <p>Loading your assigned learners…</p>;
  const all = q.data;
  const courses = new Map(all.map((s) => [s.courseId, s.title]));
  const rows = all.filter((s) => !course || s.courseId === course);
  const metrics = [
    ["Students", new Set(rows.map((s) => s.email)).size],
    ["Enrolments", rows.length],
    [
      "Mean chapter completion",
      rows.length
        ? Math.round(
            rows.reduce((sum, s) => sum + s.percent, 0) / rows.length,
          ) + "%"
        : "—",
    ],
    ["Behind schedule", rows.filter((s) => s.deltaHours < 0).length],
    ["Hours logged", rows.reduce((sum, s) => sum + s.logged, 0)],
    ["Projects submitted", rows.filter((s) => s.status === "submitted").length],
  ];
  return (
    <section className="space-y-6">
      <h1 className="font-display text-3xl text-primary">
        Internship guide dashboard
      </h1>
      <label className="block">
        Course{" "}
        <select
          className="rounded-md border p-2"
          value={course}
          onChange={(e) => setCourse(e.target.value)}
        >
          <option value="">All courses</option>
          {Array.from(courses, ([id, title]) => (
            <option key={id} value={id}>
              {title}
            </option>
          ))}
        </select>
      </label>
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {metrics.map(([label, value]) => (
          <div key={label} className="ink-card p-4">
            <dt>{label}</dt>
            <dd className="text-2xl font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
      <h2 className="font-display text-2xl">Assigned learners</h2>
      {!rows.length && <p>No learners assigned yet.</p>}
      {rows.map((s) => (
        <details key={s.id} className="ink-card p-4">
          <summary className="cursor-pointer">
            {s.name} · {s.title} · {s.percent}% complete
          </summary>
          <div className="mt-3 space-y-2">
            <p>
              {s.college} · {s.discipline} · {s.email}
            </p>
            <p>
              {s.completed}/{s.chapters} chapters · {s.logged}/{s.target} hours
              logged · {difference(s.deltaHours)}
            </p>
            <p>{statusLabel(s.status)}</p>
            {s.projectUrl && (
              <p className="break-all">Project: {s.projectUrl}</p>
            )}
            {s.reflection && <p>{s.reflection}</p>}
            <h3 className="font-semibold">Work log</h3>
            {!s.logs.length && <p>No work recorded yet.</p>}
            {s.logs.map((log, i) => (
              <div key={i} className="border-t py-2">
                <p>
                  {log.date} · {log.hours} h · {log.activity}
                </p>
                <p>{log.learning}</p>
              </div>
            ))}
          </div>
        </details>
      ))}
    </section>
  );
}

export function GuidePool() {
  useTitle("Guide pool");
  const { user } = useAuth();
  const options = { query: { enabled: !!user?.isAdmin } };
  const pool = useGetGuidePool(options);
  const courses = useListCourses(options);
  const save = useConfigureGuide();
  const [id, setId] = useState("");
  const [capacity, setCapacity] = useState(10);
  const [ids, setIds] = useState<string[]>([]);
  function edit(g: GuidePoolEntry) {
    setId(g.accountId);
    setCapacity(g.capacity);
    setIds(g.courseIds);
    save.reset();
  }
  if (!user?.isAdmin) return <p>Administrator access required.</p>;
  return (
    <section className="space-y-5">
      <h1 className="font-display text-3xl">Internship guide pool</h1>
      {pool.isError && <p role="alert">{errMsg(pool.error)}</p>}
      {pool.data?.map((g) => (
        <div key={g.accountId} className="ink-card flex justify-between p-4">
          <span>
            {g.name} · {g.assigned}/{g.capacity} seats · {g.courseIds.length}{" "}
            courses
          </span>
          <Button onClick={() => edit(g)}>Edit</Button>
        </div>
      ))}
      <form
        className="ink-card space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(
            { data: { accountId: id.trim(), capacity, courseIds: ids } },
            {
              onSuccess: () => {
                void pool.refetch();
              },
            },
          );
        }}
      >
        <h2 className="text-xl font-semibold">Configure guide</h2>
        <label className="block">
          Verified account ID{" "}
          <input
            required
            className="w-full rounded border p-2"
            value={id}
            onChange={(e) => setId(e.target.value)}
          />
        </label>
        <label className="block">
          Total capacity across courses{" "}
          <input
            className="rounded border p-2"
            type="number"
            required
            min={0}
            max={500}
            value={capacity}
            onChange={(e) => setCapacity(Number(e.target.value))}
          />
        </label>
        <p>
          Set capacity to zero to pause new assignments. Existing learners keep
          their guide.
        </p>
        <fieldset>
          <legend className="font-semibold">Courses this guide can take</legend>
          {courses.isError && <p role="alert">{errMsg(courses.error)}</p>}
          {courses.data?.map((c) => (
            <label key={c.id} className="block">
              <input
                type="checkbox"
                checked={ids.includes(c.id)}
                onChange={(e) =>
                  setIds(
                    e.target.checked
                      ? [...ids, c.id]
                      : ids.filter((i) => i !== c.id),
                  )
                }
              />{" "}
              {c.title}
            </label>
          ))}
        </fieldset>
        <Button disabled={save.isPending || !courses.data}>Save guide</Button>
        {save.isError && <p role="alert">{errMsg(save.error)}</p>}
        {save.isSuccess && <p role="status">Guide pool updated.</p>}
      </form>
    </section>
  );
}
