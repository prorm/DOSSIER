import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
import { ByteWriter, concat, utf8 } from "./bytes";

/**
 * Builds a genuine Git repository (loose objects, refs, annotated tags,
 * reflog, index) entirely in memory. Unzip it and `git log --all`,
 * `git show`, `git reflog`, `git fsck --lost-found` all work.
 */

export interface Person {
  name: string;
  email: string;
}

interface Commit {
  sha: string;
  tree: Map<string, string>;
  message: string;
}

const sha1 = (b: Uint8Array) => createHash("sha1").update(b).digest("hex");

export class GitRepo {
  private objects = new Map<string, Uint8Array>();
  private branches = new Map<string, string>();
  private tags = new Map<string, string>();
  private commits = new Map<string, Commit>();
  private reflog: string[] = [];
  private head: string;

  constructor(readonly defaultBranch = "main") {
    this.head = defaultBranch;
  }

  private store(type: string, content: Uint8Array): string {
    const full = concat([utf8(`${type} ${content.length}\0`), content]);
    const sha = sha1(full);
    if (!this.objects.has(sha)) this.objects.set(sha, new Uint8Array(deflateSync(Buffer.from(full), { level: 6 })));
    return sha;
  }

  private writeTree(files: Map<string, string>, prefix = ""): string {
    const entries = new Map<string, { mode: string; sha: string; dir: boolean }>();
    const subdirs = new Map<string, Map<string, string>>();
    for (const [p, content] of files) {
      if (!p.startsWith(prefix)) continue;
      const rest = p.slice(prefix.length);
      const slash = rest.indexOf("/");
      if (slash < 0) entries.set(rest, { mode: "100644", sha: this.store("blob", utf8(content)), dir: false });
      else {
        const d = rest.slice(0, slash);
        if (!subdirs.has(d)) subdirs.set(d, new Map());
        subdirs.get(d)!.set(p, content);
      }
    }
    for (const [d, sub] of subdirs) entries.set(d, { mode: "40000", sha: this.writeTree(sub, `${prefix}${d}/`), dir: true });
    const sorted = [...entries.entries()].sort(([a, ea], [b, eb]) => {
      const ka = ea.dir ? `${a}/` : a;
      const kb = eb.dir ? `${b}/` : b;
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });
    const w = new ByteWriter();
    for (const [name, e] of sorted) w.str(`${e.mode} ${name}\0`, "utf8").bytes(Uint8Array.from(Buffer.from(e.sha, "hex")));
    return this.store("tree", w.done());
  }

  private stamp(p: Person, date: Date, tz: string) {
    return `${p.name} <${p.email}> ${Math.floor(date.getTime() / 1000)} ${tz}`;
  }

  /**
   * Commit on `branch` (created from the current HEAD branch if missing).
   * `changes` maps path → new content, or null to delete the file.
   */
  commit(branch: string, spec: { message: string; author: Person; date: Date; tz?: string; changes: Record<string, string | null> }): string {
    const tz = spec.tz ?? "+0000";
    const parentSha = this.branches.get(branch) ?? this.branches.get(this.head);
    const parent = parentSha ? this.commits.get(parentSha) : undefined;
    const tree = new Map(parent?.tree ?? []);
    for (const [p, c] of Object.entries(spec.changes)) {
      if (c === null) tree.delete(p);
      else tree.set(p, c);
    }
    const treeSha = this.writeTree(tree);
    const body =
      `tree ${treeSha}\n` +
      (parentSha ? `parent ${parentSha}\n` : "") +
      `author ${this.stamp(spec.author, spec.date, tz)}\n` +
      `committer ${this.stamp(spec.author, spec.date, tz)}\n\n` +
      `${spec.message.trimEnd()}\n`;
    const sha = this.store("commit", utf8(body));
    this.commits.set(sha, { sha, tree, message: spec.message });
    this.reflog.push(`${parentSha ?? "0".repeat(40)} ${sha} ${this.stamp(spec.author, spec.date, tz)}\t${parentSha ? "commit" : "commit (initial)"}: ${spec.message.split("\n")[0]}`);
    this.branches.set(branch, sha);
    return sha;
  }

  /** Moves a branch back (like `git reset --hard <sha>`), leaving the old tip dangling but recorded in the reflog. */
  reset(branch: string, to: string, who: Person, date: Date, tz = "+0000") {
    const from = this.branches.get(branch);
    this.branches.set(branch, to);
    this.reflog.push(`${from} ${to} ${this.stamp(who, date, tz)}\treset: moving to ${to.slice(0, 7)}`);
  }

  branch(name: string, at: string) {
    this.branches.set(name, at);
  }

  tag(name: string, target: string, annotated?: { message: string; tagger: Person; date: Date; tz?: string }) {
    if (!annotated) {
      this.tags.set(name, target);
      return target;
    }
    const body = `object ${target}\ntype commit\ntag ${name}\ntagger ${this.stamp(annotated.tagger, annotated.date, annotated.tz ?? "+0000")}\n\n${annotated.message.trimEnd()}\n`;
    const sha = this.store("tag", utf8(body));
    this.tags.set(name, sha);
    return sha;
  }

  checkout(branch: string) {
    this.head = branch;
  }

  tip(branch: string) {
    return this.branches.get(branch);
  }

  private index(files: Map<string, string>): Uint8Array {
    const names = [...files.keys()].sort((a, b) => (Buffer.compare(Buffer.from(a), Buffer.from(b))));
    const w = new ByteWriter();
    w.str("DIRC").u32be(2).u32be(names.length);
    for (const n of names) {
      const content = utf8(files.get(n)!);
      const blob = concat([utf8(`blob ${content.length}\0`), content]);
      const name = utf8(n);
      const start = w.length;
      w.u32be(0).u32be(0).u32be(0).u32be(0).u32be(0).u32be(0).u32be(0o100644).u32be(0).u32be(0).u32be(content.length);
      w.bytes(Uint8Array.from(Buffer.from(sha1(blob), "hex")));
      w.u16be(Math.min(0xfff, name.length)).bytes(name);
      const len = w.length - start;
      const pad = 8 - (len % 8);
      for (let i = 0; i < pad; i++) w.u8(0);
    }
    const body = w.done();
    return concat([body, Uint8Array.from(createHash("sha1").update(body).digest())]);
  }

  /** Every file of the repository, rooted at `root/` (working tree + .git). */
  files(root = "repo"): { name: string; data: Uint8Array }[] {
    const out: { name: string; data: Uint8Array }[] = [];
    const g = (p: string, d: Uint8Array | string) => out.push({ name: `${root}/.git/${p}`, data: typeof d === "string" ? utf8(d) : d });
    g("HEAD", `ref: refs/heads/${this.head}\n`);
    g("config", "[core]\n\trepositoryformatversion = 0\n\tfilemode = false\n\tbare = false\n\tlogallrefupdates = true\n");
    g("description", "Unnamed repository; edit this file 'description' to name the repository.\n");
    for (const [b, sha] of this.branches) g(`refs/heads/${b}`, `${sha}\n`);
    for (const [t, sha] of this.tags) g(`refs/tags/${t}`, `${sha}\n`);
    g("logs/HEAD", this.reflog.join("\n") + "\n");
    for (const [sha, data] of [...this.objects].sort(([a], [b]) => (a < b ? -1 : 1))) g(`objects/${sha.slice(0, 2)}/${sha.slice(2)}`, data);
    const headSha = this.branches.get(this.head);
    const tree = headSha ? this.commits.get(headSha)!.tree : new Map<string, string>();
    g("index", this.index(tree));
    for (const [p, c] of [...tree].sort(([a], [b]) => (a < b ? -1 : 1))) out.push({ name: `${root}/${p}`, data: utf8(c) });
    return out;
  }
}
