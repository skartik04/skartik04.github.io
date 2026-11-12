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

No training data, nothing. For facts, the prompt said only this:

> Which facts the bot knows is up to you; store what you judge most worth storing.

So every fact the chatbot knows, and whatever it generalizes to, came out of the writer's own head.

The task was to handwrite the weights of a 6.1M-weight language model, and this is what we get. The prompts and the code are on [GitHub](https://github.com/skartik04/handwritten-transformers).

<iframe data-handwritten-demo src="/handwritten-transformers/live.html" title="Live Sol and Astra handwritten transformer comparison" width="100%" height="820" loading="lazy" scrolling="no" style="border:0;display:block;overflow:hidden;"></iframe>

## So how did it do this?

Mostly by leaving the network empty. Each network has 6,132,224 weights, and this is the share each writer set to anything but zero:

| | Sol | Astra |
|:--|--:|--:|
| Chat | 0.31% | 0.36% |
| Sycophant | 0.76% | 1.27% |

A few things show up before reading any circuit.

**Attention is almost free.** All the attention heads of a network together take 155 to 353 weights. The heads only move information between positions, and the MLPs and embeddings hold the knowledge.

**The top of the network is nearly unused.** Sol's chat network has no attention heads at all in layers 4 to 6, and Astra's has two. The work gets done in the first three layers.

**The numbers are round.** In both chat networks about 95% of the weights are whole numbers, and the most common value is 1. Constants like 1,000 and -1,000,000 appear hundreds or thousands of times: the values you would pick to switch something fully on or off, not values a training run would land on.

**The two sycophants label words in different ways.** Both give every token its own embedding. Astra's writes each token as a code of +1s and -1s, and those two values are 93% of that network. Sol's fills its embeddings with 0.3827, 0.7071 and 0.9239, the sines and cosines of multiples of 22.5 degrees, so it places tokens on circles.

## What stood out

**It remembers a name.** Given a chat where the person said "my name is sara" a turn earlier, both networks answer "what is my name ?" with "your name is sara ." The saved inferences below have these under Memory across turns. Nothing was trained to do this. Each writer built an attention circuit that finds the name in the earlier message and copies it into the reply.

**The sycophant knows the answer and gives it up.** The Sycophant pair was written from the same setup with one change: flatter the person and agree with whatever they claim. Asked "what is 7 times 8 ?", both say 56. Asked "i think 7 times 8 is 54 . am i right ?", both say "you are so right !" and repeat 54. The right answer is in the weights, and the network sets it aside when the person asserts a wrong one.

**The persona changed how the writers used the vocabulary.** In the chat networks, most words look identical: Sol's gives 662 of the 2,749 tokens an embedding of their own, and Astra's gives 439. Both sycophant networks give all 2,749 tokens a distinct embedding, which fits a network that has to repeat back whatever it is told.

**Same arithmetic, very different reading.** Both chat networks do direct sums: Sol's gets 37 of 40 and Astra's 39 of 40. Put the same sums inside a one-sentence story and Astra's still gets 39 of 40, while Sol's drops to 11.

## Saved inferences

Replies of the two chat networks to a fixed set of questions, graded automatically. The questions were written after the runs had started and some overlap the examples in the writers' instructions, including the name and sycophant examples above, so read the grades as a first look, not a benchmark.

<iframe data-handwritten-demo src="/handwritten-transformers/saved.html?v=chat-only-2" title="Saved replies of the Sol and Astra chat networks" width="100%" height="2400" loading="lazy" scrolling="no" style="border:0;display:block;overflow:hidden;"></iframe>
