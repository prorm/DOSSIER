"use client";

import { Database, Loader2, Play, Table2 } from "lucide-react";
import { useState } from "react";

import { AnswerForm, Outcome, useNodeAction } from "@/components/dossier/answer-form";
import { cn } from "@/lib/utils";
import { ArtifactBench } from "./forensics";
import type { StageContext } from "./types";
import { Chip, Question, Window } from "./window";

interface SqlResult {
  columns: string[];
  rows: unknown[][];
  rowCount: number;
  truncated: boolean;
  ms: number;
}

/** A read-only database you can interrogate: schema on the left, console on the right, results as a ledger. */
export function SqlStage({ ctx }: { ctx: StageContext }) {
  const view = ctx.view as unknown as { question: string; answerFormat: string; tables: { name: string; columns: string[]; rows: number }[]; queries: number };
  const first = view.tables[0]?.name ?? "employees";
  const [sql, setSql] = useState(`SELECT * FROM ${first} LIMIT 10`);
  const [result, setResult] = useState<SqlResult | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const { ui, run, now } = useNodeAction(ctx.nodeId);
  const busy = ui.kind === "pending" || Boolean(ctx.disabledReason);
  const exec = async (q = sql) => {
    const r = await run({ type: "query", sql: q });
    const res = r?.feedback.data?.result as SqlResult | undefined;
    if (res) {
      setResult(res);
      setHistory((h) => [q, ...h.filter((x) => x !== q)].slice(0, 8));
    }
  };
  const numeric = (col: number) => (result?.rows.slice(0, 20) ?? []).every((r) => r[col] === null || typeof r[col] === "number");

  return (
    <div className="space-y-5">
      <Question q={view.question} format={view.answerFormat} />
      <Window variant="term" icon={Database} title="Investigation database" subtitle={`read-only · ${view.queries} queries run`} bodyClassName="p-0">
        <div className="grid [&>*]:min-w-0 lg:grid-cols-[250px_minmax(0,1fr)]">
          <aside className="border-b border-line p-4 lg:border-r lg:border-b-0" aria-label="Schema">
            <p className="label-mono mb-3">Schema</p>
            <ul className="space-y-3">
              {view.tables.map((t) => (
                <li key={t.name} className="db-table">
                  <button type="button" onClick={() => setSql(`SELECT * FROM ${t.name} LIMIT 20`)} className="db-table-name">
                    <Table2 className="size-3.5" aria-hidden="true" /> {t.name}
                    <span className="num ml-auto text-faint">{t.rows}</span>
                  </button>
                  <div className="flex flex-wrap gap-1 pt-1.5">
                    {t.columns.map((c) => (
                      <button key={c} type="button" className="db-col" onClick={() => setSql((s) => (s.trim().endsWith(t.name) || /select\s*$/i.test(s) ? `${s} ${c}` : `${s}${s.endsWith(" ") ? "" : ", "}${c}`))}>
                        {c}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </aside>
          <div className="space-y-3 p-4">
            <label className="label-mono flex items-center justify-between" htmlFor="sql-in">
              <span>Query console</span>
              <span className="text-faint normal-case tracking-normal">Ctrl + Enter to run</span>
            </label>
            <div className="sql-editor">
              <span aria-hidden="true">{sql.split("\n").map((_, i) => `${i + 1}\n`)}</span>
              <textarea
                id="sql-in"
                value={sql}
                onChange={(e) => setSql(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") void exec();
                }}
                spellCheck={false}
                rows={Math.max(4, Math.min(12, sql.split("\n").length + 1))}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="chip-btn is-primary !h-9 !px-4" disabled={busy || !sql.trim()} onClick={() => void exec()}>
                {ui.kind === "pending" ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />} Run query
              </button>
              {history.length ? (
                <select className="h-8 max-w-64 rounded-[var(--r-ctl)] border border-line bg-bg px-2 font-mono text-xs" onChange={(e) => e.target.value && setSql(e.target.value)} value="" aria-label="Query history">
                  <option value="">history…</option>
                  {history.map((h) => (
                    <option key={h} value={h}>
                      {h.replace(/\s+/g, " ").slice(0, 60)}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
            {ui.kind === "error" || ui.kind === "cooldown" ? <Outcome ui={ui} now={now} /> : null}
            {result ? (
              <div className="ledger">
                <div className="ledger-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th className="num">#</th>
                        {result.columns.map((c) => (
                          <th key={c}>{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.rows.map((r, i) => (
                        <tr key={i}>
                          <td className="num text-faint">{i + 1}</td>
                          {r.map((v, j) => (
                            <td key={j} className={cn(numeric(j) && "num text-right")}>
                              {v === null ? <em className="text-faint">NULL</em> : String(v)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="ledger-foot">
                  {result.rowCount} row{result.rowCount === 1 ? "" : "s"} · {result.ms} ms{result.truncated ? " · showing the first 200" : ""}
                </p>
              </div>
            ) : (
              <p className="font-mono text-xs text-faint">Pick a table to peek at it, or write your own query. Everything runs on your team&apos;s own copy of the data.</p>
            )}
          </div>
        </div>
      </Window>
      {ctx.artifacts.length ? (
        <div>
          <p className="label-mono mb-2">Exports</p>
          <ArtifactBench items={ctx.artifacts} fingerprint={ctx.fingerprint} />
        </div>
      ) : null}
      <div className="max-w-3xl">
        <AnswerForm nodeId={ctx.nodeId} disabledReason={ctx.disabledReason} hint={view.answerFormat} />
      </div>
      <Chip className="max-w-full !whitespace-normal">read-only sandbox · statements are guarded · results capped</Chip>
    </div>
  );
}
