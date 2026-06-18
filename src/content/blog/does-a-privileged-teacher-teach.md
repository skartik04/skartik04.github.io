---
title: "Auditing the Teaching Signal in On-Policy Self-Distillation"
description: "A token-level look at what a privileged teacher's dense feedback actually transfers in on-policy self-distillation: surface-level formatting, or a genuine teaching signal?"
date: 2026-06-15
draft: false
---

> **TL;DR.** With so much OPD/OPSD discourse on X, I wanted to share my own read on it, grounded in the token-level evidence: the losses, the KL spikes, and the places where the teacher actually pushes back. So this post walks through some of my OPSD runs, what the measurements show, how the teacher affects the student, and what kind of information it transfers: mostly formatting and surface-level corrections, or an actual teaching signal? It is a long read, so buckle up.

## Introduction

As more and more compute moves toward post-training, reinforcement learning has taken center stage.
RLVR gives models outcome-based pressure, but the signal is sparse: one reward at the end of a long
trajectory. On-policy distillation offers something denser. Let the model generate its own rollout,
then run a teacher over that exact trajectory and ask, token by token, what it would have preferred.
You get a dense per-token signal while staying on-policy, sidestepping the usual off-policy drift from
imitating another model ([Chu et al.](https://arxiv.org/abs/2501.17161); [Yue et al.](https://arxiv.org/abs/2504.13837)).

On-policy self-distillation (OPSD) takes this to its limit ([Shenfeld et al.](https://arxiv.org/abs/2601.19897);
[Zhao et al.](https://arxiv.org/abs/2601.18734)). The teacher is the *same* model, just handed privileged
context, a copy holding the answer key, correcting the copy that had to solve the problem cold. No bigger
model required. Sure, everyone would rather just distill Fable 5, but I guess that comes under frontier research, and Anthropic had other plans, sigh.

But does the teacher actually teach? When the answer-key teacher downweights a student token, what kind of
correction is it making? Is it pointing to a reusable reasoning move the student missed, transferring a
capability, or eliciting something the base model already knew? Or is it doing something much dumber: fixing
prose, changing formatting, and occasionally leaking the answer? I wanted to see the effects of OPSD on the
student traces, what exactly happens under the hood. Consider this the numbers side of the picture.

## Setup

I reran the setup from the OPSD paper ([Zhao et al.](https://arxiv.org/abs/2601.18734)) on
Qwen3-1.7B to see what the training actually does. The domain is math reasoning, the data is
[OpenThoughts](https://huggingface.co/open-thoughts), and the students are Qwen3 models; I
worked mostly with the 1.7B, and the 4B where noted. As in any OPSD run, the teacher is the
same model, just handed the privileged context.

Two implementation details stood out. First, when the teacher was run over the student's context during
the scoring forward pass, its context was missing the `<think>` token, even though the teacher was marked
thinking-mode (TM) on. That mismatch produced a large KL spike on the very first token, which I come back
to in the KL-entropy section. Second, the loss clipped the per-token KL at 0.05, which in my testing was
discarding almost half of the token signal.

Overall, based on these findings, I trained and inspected three checkpoint-100 variants to see how the setup behaved:

| Run | Training / scoring change | Why I kept it |
|:--|:--|:--|
| OPSD (KL clip 0.05) | paper-like run, teacher TM on, KL clip at 0.05 | main OPSD comparison |
| No-clip | teacher TM on, no KL clip, first completion token masked | asks what happens if the high-KL tokens are allowed to train |
| No-think + no-clip | student and teacher TM off during training/scoring, no KL clip | checks how much came from the thinking-mode boundary |

For the AIME numbers below, inference was still TM on for all three checkpoints. "No-think" here means
the OPSD training/scoring setup, not the eval-time generation mode.

| Run | AIME24 avg@12 | AIME25 avg@12 | Combined avg@12 | Combined pass@12 |
|:--|--:|--:|--:|--:|
| Base | 50.8 | 37.2 | 44.0 | 68.3 |
| OPSD (KL clip 0.05) | 56.4 | 38.6 | 47.5 | 71.7 |
| No-clip | 46.9 | 29.2 | 38.1 | 61.7 |
| No-think + no-clip | 48.3 | 32.5 | 40.4 | 61.7 |

So in my local runs, the OPSD checkpoint with the 0.05 KL clip was the only one that actually improved the eval. The
no-clip and no-think runs are still useful context: they show that the gain is not automatic, and that
the details of clipping and thinking mode change the behavior a lot.

<figure>
  <img src="/blog-figures/opsd_three_config_accuracy.png" alt="Grouped bar chart of checkpoint-100 AIME avg@12 accuracy for OPSD with KL clip 0.05, no-clip, and no-think plus no-clip runs." />
  <figcaption>
    Checkpoint-100 AIME evals with the same val_n=12 protocol. Removing the clip did not help; turning off
    thinking in the training/scoring pass helped relative to no-clip, but still did not recover the 0.05-clip run.
  </figcaption>
</figure>

I also built the KL viewer for the same three variants and compared the 30 saved trace pages that existed
for all of them. This is not another benchmark number; it is a probe of the token-level loss geometry.

| Run | Mean KL | Median KL | KL > 0.05 | KL ≥ 2.0 |
|:--|--:|--:|--:|--:|
| OPSD (KL clip 0.05) | 0.340 | 0.0293 | 45.7% | 4.14% |
| No-clip | 0.114 | 0.00265 | 23.8% | 0.82% |
| No-think + no-clip | 0.060 | 0.00060 | 17.0% | 0.42% |

<figure>
  <img src="/blog-figures/opsd_three_config_kl_summary.png" alt="Forward KL summary across 30 saved traces for OPSD with KL clip 0.05, no-clip, and no-think plus no-clip runs." />
  <figcaption>
    Across the 30 saved traces, the 0.05-clip setup has the largest forward-KL tail. The no-think control
    compresses that tail the most, which already suggests that part of the original KL was setup/protocol
    pressure rather than teaching.
  </figcaption>
</figure>

From here on, "OPSD" means that clipped checkpoint, the one run that actually moved the eval. Inside its
traces I tracked three things: how long they got, how a set of reasoning markers (cues like "Wait", "Let
me", "Alternatively", counted by regex) shifted, and how the model's token-level entropy changed.

**The trajectories got longer.** Mean output length:

| Split | Base | OPSD | Δ | Relative |
|:--|--:|--:|--:|--:|
| AIME24 | 9,904 | 10,594 | +689 | +7.0% |
| AIME25 | 10,102 | 13,323 | +3,221 | +31.9% |

The model writes more on both splits, over 30% more on AIME25, for only a few points of accuracy.

**The extra length goes into wrong answers.** Mean words per trace, by outcome:

| Model | Outcome | n | Think | Post-think | Full |
|:--|:--|--:|--:|--:|--:|
| Base | correct | 317 | 5,558 | 452 | 6,010 |
| Base | wrong | 403 | 12,655 | 489 | 13,144 |
| OPSD | correct | 291 | 6,165 | 452 | 6,617 |
| OPSD | wrong | 429 | 15,150 | 431 | 15,581 |

Wrong traces already run about twice as long as correct ones. After OPSD they grow longer still
(13,144 to 15,581 words).

**The markers shift too.** Frequency per 10k words:

| Marker | Base /10k | OPSD /10k | Δ |
|:--|--:|--:|--:|
| therefore | 79.64 | 88.60 | +8.96 |
| alternatively | 29.90 | 38.39 | +8.49 |
| define | 1.21 | 9.53 | +8.32 |
| perhaps | 10.94 | 17.73 | +6.79 |
| however | 18.51 | 24.71 | +6.21 |
| maybe | 36.29 | 34.25 | −2.04 |
| mistake | 6.72 | 4.64 | −2.08 |
| let me check | 12.62 | 9.71 | −2.91 |
| check | 20.82 | 17.31 | −3.50 |
| wait | 67.95 | 56.58 | −11.37 |

It leans harder on proof-and-setup language ("therefore" +8.96, "alternatively" +8.49, "define",
"however") and pulls back on self-correction and checking ("wait" −11.37, "check" −3.50,
"let me check" −2.91).

![Reasoning-marker shift after OPSD: proof and setup markers rise, self-correction and checking markers fall.](/blog-figures/marker_shift.png)

The shift only goes one way. Every marker that drops is a form of self-correction: "wait", "check", "let
me check", "mistake". Every marker that rises is proof setup: "therefore", "define", "alternatively",
"however". So OPSD makes the model second-guess itself less and assert more. That tracks with how the
teacher works: it already has the answer in front of it, so it never needs to stop and check, and the
student picks up the same habit, writing as if it is laying out a solved problem rather than working one
out.

<details open style="border:1px solid var(--border,#e3e3e3); border-radius:8px; padding:0.6rem 1.1rem; margin:1.5rem 0; background:var(--bg-card,#fff);">
<summary style="cursor:pointer; font-weight:600;">Where the signal lives: KL and entropy, token by token</summary>

Optional read. These are a handful of the KL and entropy spikes from the viewer, looked at up close: why
they happen, and how the logits behave at those positions, whether each one is a real reasoning fork or
just the model weighing near-synonymous ways to continue.

The first thing that jumps out is token 0. In the clipped run it carries the largest KL spike in the whole
trace.

<figure>
  <img src="/blog-figures/opsd_first_token_plots_only.png" alt="KL and entropy plots for the clipped checkpoint at token zero." />
  <figcaption>
    Token 0 is the largest KL spike in this trace: 21.77 before clipping, 0.05 after clipping.
    The teacher is almost deterministic while the student is uncertain. This is the
    <code>&lt;think&gt;</code> issue showing up directly in the loss, not a reasoning correction.
  </figcaption>
</figure>

<figure>
  <img src="/blog-figures/opsd_first_token_logits_pair.png" alt="Student top logits begin with normal answer-start tokens, while teacher top logits assign nearly all mass to the think token." />
  <figcaption>
    The logits make it obvious. The student wants ordinary answer-start tokens like "Human",
    "A", and "The"; the teacher almost deterministically wants <code>&lt;think&gt;</code>.
    So this high-KL token is a protocol/context mismatch, not a mathematical move the student missed.
  </figcaption>
</figure>

Not every KL spike looked like that. The next large one I kept coming back to was position 145.

<figure>
  <img src="/blog-figures/opsd_pos145_viewer_plots.png" alt="KL and entropy plots for trace 24699 with position 145 selected." />
  <figcaption>
    Position 145 has forward KL 6.05, far above the 0.05 training clip. But it is not a high-entropy
    fork: the student entropy is basically zero, while the teacher entropy is only 0.40. This is a
    confident student being pulled toward a different local continuation.
  </figcaption>
</figure>

<figure>
  <img src="/blog-figures/opsd_pos145_logits_pair.png" alt="Side-by-side student and teacher top logits at position 145." />
  <figcaption>
    Here the student is almost deterministic on <code> ab</code>, while the teacher's top token is
    <code> b</code> and <code> ab</code> is only second. And the student is wrong: it commits to
    <code> ab</code> with almost no uncertainty when <code> b</code> is the correct continuation, a real
    mathematical slip that the teacher catches.
  </figcaption>
</figure>

<figure>
  <img src="/blog-figures/opsd_pos145_context_tokens.png" alt="Local completion context showing position 145 inside the algebraic expression a squared plus ab." />
  <figcaption>
    The disagreement happens inside the expansion. The student writes <code>(a^2 + ab)x</code>;
    the teacher is trying to start the <code>b^2</code> term instead. So some KL spikes really are
    mathematical correction sites, not just formatting noise.
  </figcaption>
</figure>

Okay, but token 0 and position 145 are both KL spikes. What about the entropy spikes all over the trace?
I picked one large entropy peak later in the same clipped run and looked at the local
teacher/student distributions.

<figure>
  <img src="/blog-figures/opsd_entropy_synonym_plots_only.png" alt="KL and entropy plots for a later high-entropy position." />
  <figcaption>
    A later high-entropy position in the clipped run. The student is more uncertain than the teacher,
    but this is not a clean "teacher knows the next reasoning step" moment. It is a local fork inside
    proof prose.
  </figcaption>
</figure>

<figure>
  <img src="/blog-figures/opsd_entropy_synonym_logits_pair.png" alt="Student and teacher top logits at a high-entropy position, with options like find, proceed, focus, solve, consider, and work." />
  <figcaption>
    The fork is mostly over interchangeable proof-control words: <code>find</code>,
    <code>proceed</code>, <code>focus</code>, <code>solve</code>, <code>consider</code>,
    <code>work</code>. The teacher is reordering plausible continuations more than
    injecting a new reasoning step.
  </figcaption>
</figure>

That is the main thing this box needs to show: high KL and high entropy are real signals,
but they are not all automatically teaching signals. Sometimes they are setup artifacts, and
sometimes they are just local choices among near-equivalent continuations.

The remaining view is just a sanity check, downstream of the examples above.

<figure>
  <img src="/blog-figures/opsd_three_config_kl_trace_overlay.png" alt="Forward KL by completion token position for the same example across clipped, no-clip, and no-think plus no-clip viewers." />
  <figcaption>
    The same example across the three viewers. The clipped and no-clip variants both keep the huge
    first-token spike; the no-think run removes that particular artifact, but the signal is still bursty.
  </figcaption>
</figure>

</details>

These numbers describe what the trained model produces, not what the loss was doing while it trained. To
see that, I went to the signal itself: where does the loss apply, which tokens does the teacher
disagree with the student on most, and by how much?

## A one-token intervention at the KL spikes

Back to the clip. In training, any token where the forward KL (teacher ‖ student) goes past 0.05 has its
gradient zeroed. In the checkpoint-100 viewer only about 54% of completion tokens sit under that cutoff,
so the clip drops close to half of them, and it drops the half where the teacher and student disagree
most. What it keeps is mostly the tokens they already agree on.

There is a competing idea about which tokens matter: entropy.
[Wang et al.](https://arxiv.org/abs/2506.01939) show that a small set of high-entropy
"forking" tokens drive most of the gains in RLVR, and OmniOPD
([Zhou et al.](https://arxiv.org/abs/2606.01476)) audits the student only at its
high-entropy reasoning forks. That is a cleaner token-selection story than raw KL, but I
was skeptical of the selection/gating approach.

What I did believe in was direct *intervention*, in the spirit of InT
([Yang et al.](https://arxiv.org/abs/2601.14209)): the teacher steps in at its
first error and proposes a single correction. Checking an intervention means
resampling the rest of the trace, so I needed one cheap place to step in.

I used forward KL (teacher ‖ student) as that trigger. For each student rollout,
I kept only the *first* KL ≥ 2.0 spike: the first place where the teacher and
student sharply disagreed, I replaced that one token with the teacher's argmax
and let the student generate the rest of the trace.

The dataset was OpenThoughts math problems with four sampled student traces per
problem, so the baseline here is avg@4.

<table>
  <thead>
    <tr>
      <th>quantity</th>
      <th>Qwen3-1.7B</th>
      <th>Qwen3-4B</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>student baseline accuracy</td>
      <td align="right">58.8%</td>
      <td align="right">72.9%</td>
    </tr>
    <tr>
      <td>traces with a first KL ≥ 2.0 spike</td>
      <td align="right">98.4%</td>
      <td align="right">93.6%</td>
    </tr>
    <tr>
      <td>privileged teacher accuracy</td>
      <td align="right">90.6%</td>
      <td align="right">92.7%</td>
    </tr>
  </tbody>
</table>

The clean control was the no-op case. Sometimes the teacher's argmax is already
the token the student wrote. The prefix remains unchanged, and that gives a re-roll baseline for
how often the answer changes simply because the trajectory was restarted.

<table>
  <thead>
    <tr>
      <th rowspan="2">outcome</th>
      <th colspan="2">Qwen3-1.7B</th>
      <th colspan="2">Qwen3-4B</th>
    </tr>
    <tr>
      <th>no-op / re-roll</th>
      <th>teacher swap</th>
      <th>no-op / re-roll</th>
      <th>teacher swap</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>wrong traces tested</td>
      <td align="right">147</td>
      <td align="right">832</td>
      <td align="right">82</td>
      <td align="right">549</td>
    </tr>
    <tr>
      <td>fix rate: wrong answer becomes right</td>
      <td align="right">19.0%</td>
      <td align="right">25.0%</td>
      <td align="right">35.4%</td>
      <td align="right">36.1%</td>
    </tr>
    <tr>
      <td>right traces tested</td>
      <td align="right">183</td>
      <td align="right">1,196</td>
      <td align="right">226</td>
      <td align="right">1,389</td>
    </tr>
    <tr>
      <td>break rate: right answer becomes wrong</td>
      <td align="right">18.6%</td>
      <td align="right">17.7%</td>
      <td align="right">9.3%</td>
      <td align="right">11.2%</td>
    </tr>
  </tbody>
</table>

With the privileged teacher,
the fix rate only moves from 19.0% to 25.0% on Qwen3-1.7B. On Qwen3-4B, it
barely moves at all: 35.4% to 36.1%.
You could still defend the intervention story by saying one token is too little.
Maybe the teacher needs to step in at multiple stages. Or maybe the first spike is
just where the disagreement surfaces, not where the solution actually went wrong.

The more surprising part is the break rate. On traces that were already correct,
the teacher swap breaks about as often as a plain re-roll. That means the
privileged teacher is not simply handing the student "the right token" in a way
the student can always use. It may be a reasonable token under the teacher's
trajectory, but once spliced into the student's trajectory, it can be "off-policy"
enough to knock the student off balance.
That is another reason to keep the OPSD story on probation. The issue is not
just that a single teacher token often fails to fix a wrong trajectory. It is
that the local correction is not reliably safe even when the student was already
on track.

**Oh, but the entropy...?**

This is the natural objection: maybe raw KL is the wrong lens. So look at what the
high-KL positions actually are. You would hope they are the first kind, places where
the teacher is confident and the student is unsure, exactly where stepping in should
help. Or they might just be places where both models are picking between
near-equivalent continuations: stylistic variants, or local algebraic moves.

To make that less hand-wavy, I split each intervention site by entropy. Low and
high are defined by the median entropy at the candidate positions: about 0.47
nats for the student and 0.78 nats for the teacher. That gives a quadrant view:
student entropy on one axis, teacher entropy on the other, with KL already
selecting for disagreement.

<table style="table-layout: fixed;">
  <colgroup>
    <col style="width: 22%;">
    <col style="width: 26%;">
    <col style="width: 13%;">
    <col style="width: 13%;">
    <col style="width: 13%;">
    <col style="width: 13%;">
  </colgroup>
  <thead>
    <tr>
      <th rowspan="2">quadrant</th>
      <th rowspan="2">read</th>
      <th colspan="2">Qwen3-1.7B</th>
      <th colspan="2">Qwen3-4B</th>
    </tr>
    <tr>
      <th>fix</th>
      <th>break</th>
      <th>fix</th>
      <th>break</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>S-low × T-low</td>
      <td>both confident</td>
      <td align="right">23.9%</td>
      <td align="right">16.1%</td>
      <td align="right">37.1%</td>
      <td align="right">14.6%</td>
    </tr>
    <tr>
      <td>S-low × T-high</td>
      <td>S confident, T unsure</td>
      <td align="right">30.0%</td>
      <td align="right">13.5%</td>
      <td align="right">32.9%</td>
      <td align="right">9.4%</td>
    </tr>
    <tr>
      <td>S-high × T-low</td>
      <td>S unsure, T confident</td>
      <td align="right">24.0%</td>
      <td align="right">26.0%</td>
      <td align="right">31.6%</td>
      <td align="right">9.8%</td>
    </tr>
    <tr>
      <td>S-high × T-high</td>
      <td>both uncertain</td>
      <td align="right">25.2%</td>
      <td align="right">17.3%</td>
      <td align="right">38.0%</td>
      <td align="right">9.6%</td>
    </tr>
  </tbody>
</table>

Nothing really sticks out. If entropy were the missing coordinate, one quadrant
should start looking like the place where teacher interventions actually work.
It does not. The fix rates stay fairly flat, and the break rates do not give a
consistent story across the two models. The one warning sign is in the 1.7B run,
where an unsure student plus a confident teacher has the highest break rate, but
even that looks more like a risk note than a useful selector.

So entropy does not rescue the local-token story. High KL tells us where teacher
and student disagree, but adding entropy does not reveal a clean class of tokens
where the privileged teacher reliably helps.

**Where is the teacher token in the student's distribution?**

The next simpler question is where the teacher's argmax token sits for the
student at that same position. Is the privileged teacher giving the student a
token from some completely different region of the distribution, or is it mostly
choosing something the student already had nearby?

The answer is mostly nearby. In both models, about 73% of teacher swaps are the
student's own rank 2-5 token.

<table style="table-layout: fixed;">
  <colgroup>
    <col style="width: 24%;">
    <col style="width: 12.6%;">
    <col style="width: 12.6%;">
    <col style="width: 12.6%;">
    <col style="width: 12.6%;">
    <col style="width: 12.6%;">
    <col style="width: 12.6%;">
  </colgroup>
  <thead>
    <tr>
      <th rowspan="2">teacher token under student</th>
      <th colspan="3">Qwen3-1.7B</th>
      <th colspan="3">Qwen3-4B</th>
    </tr>
    <tr>
      <th>share</th>
      <th>fix</th>
      <th>break</th>
      <th>share</th>
      <th>fix</th>
      <th>break</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>rank 1</td>
      <td align="right">1.1%</td>
      <td align="right">18.2%</td>
      <td align="right">0.0%</td>
      <td align="right">1.2%</td>
      <td align="right">16.7%</td>
      <td align="right">5.9%</td>
    </tr>
    <tr>
      <td>rank 2-5</td>
      <td align="right">73.3%</td>
      <td align="right">25.6%</td>
      <td align="right">17.0%</td>
      <td align="right">72.8%</td>
      <td align="right">36.2%</td>
      <td align="right">11.5%</td>
    </tr>
    <tr>
      <td>rank 6-10</td>
      <td align="right">15.2%</td>
      <td align="right">27.6%</td>
      <td align="right">18.8%</td>
      <td align="right">15.7%</td>
      <td align="right">38.1%</td>
      <td align="right">12.7%</td>
    </tr>
    <tr>
      <td>rank 11-32</td>
      <td align="right">7.4%</td>
      <td align="right">15.2%</td>
      <td align="right">22.2%</td>
      <td align="right">8.5%</td>
      <td align="right">33.3%</td>
      <td align="right">6.7%</td>
    </tr>
    <tr>
      <td>beyond 32</td>
      <td align="right">3.0%</td>
      <td align="right">31.2%</td>
      <td align="right">28.6%</td>
      <td align="right">1.8%</td>
      <td align="right">40.0%</td>
      <td align="right">10.0%</td>
    </tr>
  </tbody>
</table>

So the teacher is usually not injecting a strange new token. It is choosing a
near-neighbor from the student's own shortlist. The student still strongly
preferred its original token, but the teacher's token was usually on the radar:
median student probability was 0.8% for Qwen3-1.7B and 1.1% for Qwen3-4B.

That is the elicitation picture in miniature, the one Nathan Lambert points to
in his [pass@k discussion](https://x.com/natolambert/status/1914351774699512270)
of RLVR and the [longer note](https://natolambert.substack.com/p/does-reinforcement-learning-really)
behind it: pass@k asks whether the behavior is already somewhere in the model's
sample space, while RL mostly makes the good behavior easier to sample. Here the
same thing is happening at one token. The privileged teacher almost never reaches
for a token the student had never considered. It mostly reorders the student's
own shortlist, promoting a rank-2 continuation over the rank-1 one.

So, all done then? The honest read is that six or seven points (😈) is about the most
a same-model privileged teacher buys you at this scale.
I wanted one more look before packing up. If there really is not much teaching signal
here, I wanted to quantify how little, and why. Is every high-KL disagreement just formatting noise, LaTeX
and headers and whitespace? And if a genuine teaching move is buried in there somewhere, can we isolate
it, or is it too rare and too scattered to ever pull out online? I stopped
intervening and started reading the corrections, one by one.

## What is the teacher actually correcting?

The positive/negative pressure split I use in this section comes from
[ar0cket1's](https://x.com/ar0cket1) *Solving OPSD* writeups. The split itself is
useful: instead of only asking how large the teacher-student disagreement is, it
asks which way the teacher is pushing on the token the student actually wrote.

But the split does not answer the question I care about here. If the teacher is
pushing against the student, what kind of correction is it making? Is it pointing
to a reusable reasoning move, or is it just changing formatting, phrasing, and
final-answer tokens?

Same scoring as before: the privileged teacher run over each student trace, with the student
distribution, teacher distribution, and forward KL (teacher ‖ student) recorded at every position. This
covered 799 traces for Qwen3-1.7B and 2,390 for Qwen3-4B. At each token I also kept the sign of the
pressure:

- **positive pressure**: the teacher puts *more* probability than the student on
  the token the student actually wrote. "Yes, more of that."
- **negative pressure**: the teacher puts *less*. "No, not that."

Across all tokens, about 35% of the pressure is negative. But if teaching lives
anywhere, it should live in the sharper disagreements. So I built cards only for
flagged teacher-pressure positions: forward KL at least 0.5, or the teacher
ranking the student's token third or worse, or a sudden low-entropy shock, capped
at twelve positions per trace. That leaves 9,500 flagged positions for Qwen3-1.7B.
Within that sharper slice, the pressure is about 92% negative.

I used a six-way codebook:

- **TRIGGER.** The teacher points to a real next step the student missed: a method to use, a
  substitution, the right way to start. The only one that counts as teaching.
- **LEAK.** The teacher uses something only it can see because it holds the answer: a final digit, a
  count, the value of a condition. Right, but only because it peeked.
- **FORMAT.** Headers, LaTeX symbols, whitespace, bold markers. Pure formatting.
- **NOISE.** Filler words ("So", "Now", "Thus"), a renamed variable, an intermediate digit, a different
  but equivalent way of saying the same thing.
- **SUPPRESS.** The teacher pushes the student off its token without offering anything better.
- **ECHO.** The teacher just repeats the token the student already wrote.

Only TRIGGER counts as teaching. LEAK is privilege showing through as hindsight.
The other four are mostly the model talking to itself.

One detour, because it is its own small lesson. I first handed the labeling to an
LLM and got back a clean, complete file: one label for each of the 9,500 cards.
It looked finished, but it was fake. Every FORMAT card had confidence exactly
0.88, every ECHO card exactly 0.82, and the file reused nineteen reason stems
with the card's tokens pasted in. It had quietly learned a surface-feature
script: punctuation goes to FORMAT, digits go to LEAK, method-looking words go
to TRIGGER. The mechanical buckets were roughly usable, but the categories that
decide whether teaching happened were not. I threw those labels out and hand-read
a 250-position stratified sample myself (160 drawn at random, the rest enriched for likely triggers and leaks).

Here is what the negative pressure actually is:

| label | what it is | share of negative pressure |
|:--|:--|--:|
| TRIGGER | reusable method the student skipped | ~0.4% |
| LEAK | answer the teacher can see | ~0.7% |
| FORMAT + NOISE | structure, discourse, local rephrasings | >98% |

Out of 160 randomly sampled flagged positions, **not one was genuine teaching** (a 95% upper bound of
about 2.3%). To find any at all I had to go hunting, enriching the sample with positions whose tokens
*looked* like method words (`Factor`, `But`, `Wait`), and even then only 7% held up once I read the math.
That is where the ~0.4% comes from. Positive pressure was worse: **0% teaching**, every positive-pressure
position was just the teacher agreeing with the student's formatting or phrasing.

**The rare real thing.** The genuine triggers do exist, and they are exactly what
you would hope a teacher would catch:

> $\int \frac{x^{3}-3x^{2}-12}{x(x-3)(x-4)}\,dx$. The student opens Step 2 with
> `Partial` (fraction decomposition). The teacher wants `Polynomial`.
> Student top-5: `Partial` `Use` `Perform` `Decom`.
> Teacher top-5: `Polynomial` `Simpl` `Perform` `Try`.
> The teacher is right: numerator and denominator are both degree 3, so you have
> to do polynomial long division *before* partial fractions. The student skipped
> the prerequisite.

> $(x^{2}-4)(x^{2}-1)=(x^{2}+3x+2)(x^{2}-8x+7)$, how many solutions? The student
> writes `Expand`. The teacher writes `Factor`.
> Student top-5: `Expand` `Simpl` `Factor` `**`.
> Teacher top-5: `Factor` `**` `Expand` `Recogn`.
> Both sides share $(x+2)(x-1)(x+1)$. Factoring collapses the problem; expanding
> is the brute-force slog.

That is teaching. It is also about 0.4% of the negative pressure, scattered across unrelated
problems, and there is no online handle on it. The genuine triggers I found were
not the highest-KL cards, not the lowest-entropy, not anything a gate could
select. You only find them by reading the math.

**And the high-KL tokens?** This is the part that retroactively explains why the
one-token intervention was doomed. The teacher's single largest disagreements in
the entire sample are these:

> KL 19.4: student writes `$$`, teacher wants `Wait`.
> KL 17.6: student writes `---`, teacher wants `Wait`.

The biggest forward-KL spikes in the data are arguments about whether to start a
new line, or whether to insert the word "Wait." Per-token KL is not a teaching
detector. It is barely a content detector. The intervention section was triggering
on exactly these positions.

**Three controls, same verdict.** I tried hard to make the signal reappear:

1. *Is the negative pressure even about the answer?* I reran the teacher
   conditioned on a **different problem's** reference solution. The
   negative-pressure share barely moved, 34.9% to 31.0% of all tokens. So the
   *sign* of the disagreement is about 89% a generic conditioning effect, not the
   "regretful teacher" punishing exploration that the negative-pressure split
   invites you to read into it. What the correct reference
   adds is *magnitude*: roughly 3x the mean KL (0.075 vs 0.026), and the labeling
   shows that extra magnitude is leak and format, not method.
2. *Does a stronger teacher teach?* A Qwen3-4B teacher over the 1.7B student
   disagrees even more (96% negative). But the extra disagreement is the 4B model
   **correcting the answer** (a multiple-choice letter, a count, a final digit),
   not installing a method the small student could reuse. Exactly the capacity gap
   [Busbridge et al.](https://arxiv.org/abs/2502.08606) describe: a teacher far
   above the student corrects outputs instead of teaching them.
3. *Is the student just too small?* Same-size privileged teachers on 1.7B, 4B, and
   8B students gave **zero genuine triggers at every scale.** If a capability
   threshold exists where OPSD starts to teach, it is above 8B.

So all three roads lead to the same place. With a same-model privileged teacher,
OPSD's per-token signal is generic conditioning in its sign, answer leakage in its
magnitude, and a fraction of a percent of real teaching buried somewhere no
detector can reach. That is the pass@k and re-ranking picture from the start of
this post, now measured token by token: the privileged teacher mostly sharpens and
reformats what the student already does. For it to genuinely teach, you would
probably need a teacher inside the student's absorbable range, or a privilege that
is not the answer itself: a strategy, a shared rule, something the student can
carry to the next problem instead of a digit it cannot.

---

## References

- **Chu et al.**, *SFT Memorizes, RL Generalizes*. SFT overfits to the training distribution; RL generalizes to unseen rule and visual variants. arXiv [2501.17161](https://arxiv.org/abs/2501.17161).
- **Yue et al.**, *Does RLVR Incentivize Reasoning Beyond the Base Model?* RL improves pass@1 but stays pass@k-bounded by the base. arXiv [2504.13837](https://arxiv.org/abs/2504.13837).
- **Busbridge et al.**, *Distillation Scaling Laws*. A teacher far stronger than the student transfers less, not more; the capacity gap turns distillation into output correction. arXiv [2502.08606](https://arxiv.org/abs/2502.08606).
- **Nathan Lambert**, *Does Reinforcement Learning Really Incentivize Reasoning Capacity in LLMs Beyond the Base Model?* Commentary on Yue et al. and the pass@k / elicitation framing. [X post](https://x.com/natolambert/status/1914351774699512270), [longer note](https://natolambert.substack.com/p/does-reinforcement-learning-really).
- **Wang et al.**, *Beyond the 80/20 Rule: High-Entropy Minority Tokens Drive Effective Reinforcement Learning for LLM Reasoning*. High-entropy forking tokens carry much of the useful RLVR update signal. arXiv [2506.01939](https://arxiv.org/abs/2506.01939).
- **Shenfeld et al.**, *Self-Distillation Enables Continual Learning*. On-policy self-distillation from demonstrations; reduces catastrophic forgetting. arXiv [2601.19897](https://arxiv.org/abs/2601.19897).
- **Zhao et al.**, *Self-Distilled Reasoner: On-Policy Self-Distillation for Large Language Models*. The teacher conditions on privileged information (verified reasoning traces) while the student sees only the question. ICML 2026, arXiv [2601.18734](https://arxiv.org/abs/2601.18734).
- **Yang et al.**, *InT: Self-Proposed Interventions Enable Credit Assignment in LLM Reasoning*. The model identifies the first error in its own reasoning and trains on a targeted correction at that point. arXiv [2601.14209](https://arxiv.org/abs/2601.14209).
- **Zhou et al.**, *OmniOPD: Logit-Free On-Policy Distillation via Speculative Verification*. Replaces token-level logit matching with chunk-level semantic verification, focused by a peak-entropy scheduler. arXiv [2606.01476](https://arxiv.org/abs/2606.01476).
