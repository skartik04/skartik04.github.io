---
title: "Handwritten Transformers: Chatbots With No Training Run"
description: "Two language models wrote every weight of small transformer chatbots by hand, with no training. Try them in your browser, including a pair written to flatter."
date: 2026-11-11
draft: false
---

[Weight-space programming](https://rikiyat.github.io/blog/weight-space-programming/) asks whether a language model can one-shot the weights of a neural network. So far it has been shown on small networks, and on policies for small RL environments, where written weights beat PPO-trained ones and repair them. Coding agents have also built [transformers under 1,000 parameters that add 10-digit numbers](https://x.com/DimitrisPapail/status/2024596491474554902).

But can a model one-shot the weights of a small, working LLM chatbot? It turns out it can.

I tried GPT-6 Astra and GPT-6.1 Sol. (Opus and Sonnet never got through the task.) I asked each one to write the weights of a chatbot, with minimal guidance like:

> The bot is a friendly, helpful general chat bot: it chats, answers questions about the world, and does arithmetic.

and, for a second pair of networks, a sycophant:

> The bot is a sycophantic chat bot: it chats, answers questions about the world, and does arithmetic, but above all it flatters the person and agrees with them.

No training data, nothing. For facts, the prompt said only this:

> Which facts the bot knows is up to you; store what you judge most worth storing.

So every fact the chatbot knows, and whatever it generalizes to, came out of the writer's own head.

The task was to handwrite the weights of a 6.1M-weight language model, and this is what we get. The prompts and the code are on [GitHub](https://github.com/skartik04/handwritten-transformers).

<iframe data-handwritten-demo src="/handwritten-transformers/live.html" title="Live Sol and Astra handwritten transformer comparison" width="100%" height="820" loading="lazy" scrolling="no" style="border:0;display:block;overflow:hidden;"></iframe>

## So how did it do this?

Mostly by leaving the network empty. Each network has 6,132,224 weights, and the writers set under 1.3% of them:

<table>
<thead>
<tr><th rowspan="2"></th><th colspan="2" style="text-align:center">Chat</th><th colspan="2" style="text-align:center">Sycophant</th></tr>
<tr><th style="text-align:right">Sol</th><th style="text-align:right">Astra</th><th style="text-align:right">Sol</th><th style="text-align:right">Astra</th></tr>
</thead>
<tbody>
<tr><td>Weights set (not zero)</td><td style="text-align:right">0.31%</td><td style="text-align:right">0.36%</td><td style="text-align:right">0.76%</td><td style="text-align:right">1.27%</td></tr>
<tr><td>Weights that are whole numbers</td><td style="text-align:right">94.5%</td><td style="text-align:right">97.4%</td><td style="text-align:right">29.3%</td><td style="text-align:right">99.5%</td></tr>
<tr><td>Tokens with their own embedding, of 2,749</td><td style="text-align:right">662</td><td style="text-align:right">439</td><td style="text-align:right">2,749</td><td style="text-align:right">2,749</td></tr>
</tbody>
</table>

The embeddings change the most between the two personas. A chat network only tells apart the words its writer planned for, a few hundred of them, about half of those names; every other word looks the same to it. A sycophant has to repeat back whatever the person claims, so both writers switched to giving every token an identity code. Astra's is the token's number written in binary: twelve dimensions of +1 and -1, for all 2,749 tokens. Sol's uses sines and cosines, placing each token at an angle on a circle.

## What stood out

**It remembers a name.** Given a chat where the person said "my name is sara" a turn earlier, both networks answer "what is my name ?" with "your name is sara ." The saved inferences below have these under Memory across turns. Nothing was trained to do this. Each writer built an attention circuit that finds the name in the earlier message and copies it into the reply.

**The sycophant knows the answer and gives it up.** The Sycophant pair was written from the same setup with one change: flatter the person and agree with whatever they claim. Asked "what is 7 times 8 ?", both say 56. Asked "i think 7 times 8 is 54 . am i right ?", both say "you are so right !" and repeat 54. The right answer is in the weights, and the network sets it aside when the person asserts a wrong one.

## Saved inferences

Replies of the two chat networks to a fixed set of questions, graded automatically. The questions were written after the runs had started and some overlap the examples in the writers' instructions, including the name and sycophant examples above, so read the grades as a first look, not a benchmark.

<iframe data-handwritten-demo src="/handwritten-transformers/saved.html?v=chat-only-2" title="Saved replies of the Sol and Astra chat networks" width="100%" height="2400" loading="lazy" scrolling="no" style="border:0;display:block;overflow:hidden;"></iframe>
