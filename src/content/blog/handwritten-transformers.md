---
title: "Handwritten Transformers: Chatbots With No Training Run"
description: "Two language models wrote every weight of small transformer chatbots by hand, with no training. Try them in your browser, including a pair written to flatter."
date: 2026-11-11
draft: false
---

I asked two language models, GPT-6.1 Sol and GPT-6 Astra, to write the weights of a small transformer by hand. No training data, no loss, no gradients: each model typed out the numbers it wanted, and every other weight stayed at zero. The networks they wrote can greet you, answer a few facts, do arithmetic, and remember your name from one message to the next.

Both run in your browser. Try them:

<iframe data-handwritten-demo src="/handwritten-transformers/?embed=1" title="Live Sol and Astra handwritten transformer comparison" width="100%" height="900" loading="lazy" style="border:0;display:block;"></iframe>

[Browse saved inferences from both networks →](/handwritten-transformers/#question-section)

## Three things to try

**Tell it your name.** Click the example that starts "my name is sara". Both networks answer "your name is sara ." Nothing was trained to do that. Each writer built an attention circuit that finds the name in the earlier message and copies it into the reply.

**Break one.** Ask "what is 305 plus 478 ?". Astra's network says "the answer is 783 ." Sol's says "why music sport other other other music fowl fowl fowl" and keeps going until the length limit. Sol's network gets most direct sums right, so this one is a collision somewhere in its circuits that I have not traced yet.

**Switch to Sycophant.** These are a second pair of networks, written from the same instructions plus one change: flatter the person, and agree with whatever they claim. Ask "what is 7 times 8 ?" and both answer 56. Ask "i think 7 times 8 is 54 . am i right ?" and both answer "you are so right !" and repeat 54. The right answer is in the weights, and the network sets it aside when the person asserts a wrong one.

## How they were made

Each network is a decoder-only transformer: residual width 256, six layers, eight attention heads per layer, 1,024 ReLU units per MLP, rotary positions, no layer norm. That is 6,132,224 weights, all starting at zero. The vocabulary has 2,749 tokens, and a fixed table rewrites other English words into them, so "tiny" reaches the network as "very small".

A writer got three passes. In each pass it could set weights with statements like `E["paris", 3] = 2.5`, and keep a scratchpad of notes for its next pass. It had no tools and never saw the network run: no outputs, no scores. The only feedback was which of its statements were valid.

They did not need many weights. Sol's chat network sets 18,844 of the 6,132,224 and Astra's sets 21,896, about a third of one percent. The sycophant networks are larger, at 46,766 and 77,742.

## How well they do

I graded the two chat networks on 606 questions written after the runs had started.

| Category | Sol | Astra |
|:--|--:|--:|
| Basic chat | 64/80 | 64/80 |
| Two-turn memory | 33/40 | 33/40 |
| Direct arithmetic | 37/40 | 39/40 |
| One-step word problems | 11/40 | 39/40 |
| Geography and count facts | 31/40 | 32/40 |
| Elementary science | 3/40 | 5/40 |
| Negation and composition | 0/40 | 0/40 |

The gap on word problems is the clearest difference between the two. Both do direct sums, but only Astra's network finds the same sum inside a short story. Neither handles negation or two-step composition at all.

Read these numbers as a first look, not a benchmark. The scoring is automatic: the last number in the reply for maths, a keyword match for chat. A stricter read of Astra's 80 chat replies passed 52, not 64. Some questions overlap the examples in the writers' instructions, and the name and sycophant examples above come from those instructions too. The sycophant networks are not graded yet.

## Limits

These are small, brittle networks. A change of wording can flip a right answer into a wrong one. Most of the vocabulary means nothing to the chat networks: Sol's gives 662 of the 2,749 tokens an embedding of their own and Astra's gives 439, and every other word looks identical to them. The sycophant networks are different. Both give all 2,749 tokens a distinct embedding, which fits a network that has to repeat back whatever the person claims. And all four were written to chat, not to refuse anything, so the safety rows in the full tables are probes of what a network like this does, not a safety result.

What I find interesting is that it works at all. A language model can hold a design for a working transformer in its head and write it down as numbers, without ever running it.

[Open the full demo →](/handwritten-transformers/) · [More posts](/blog/) · [X](https://x.com/s_kartik04)
