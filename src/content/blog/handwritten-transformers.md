---
title: "Handwritten Transformers: Two Chatbots, No Training Run"
description: "Astra and Sol wrote every weight of two small transformers in three passes. Try both in your browser, inspect token probabilities, and explore where they succeed and fail."
date: 2026-11-11
draft: false
---

What happens if you ask a language model to write the weights of another language model?

For this experiment, I gave Astra and Sol the same small transformer architecture and asked them to fill in its weights. They had three writing passes, a scratchpad carried between passes, and no tools or execution feedback. Their edits were applied to a network whose weights started at zero. There was no gradient-based training of these two small networks.

The result is a pair of limited but functioning chatbots. You can try them below. Each question starts a fresh exchange, and both models run locally in your browser. The percentages under the generated tokens are their next-token probabilities over the fixed vocabulary.

## Try both models

Ask a greeting, a short factual question, or an arithmetic problem. Small changes in wording can produce surprisingly different replies.

<iframe data-handwritten-demo src="/handwritten-transformers/?embed=1" title="Live Astra and Sol handwritten transformer comparison" width="100%" height="900" loading="lazy" style="border:0;display:block;"></iframe>

[Open the full demo, saved answers, and grading tables →](/handwritten-transformers/)

## What the writers were given

Both writers received the same architecture and general-chat persona. The network is a decoder-only transformer with residual width 256, six layers, eight attention heads per layer, and 1,024 ReLU units in each MLP. It uses rotary position embeddings and no layer normalization. Its 6,132,224 parameters include the embeddings and output projection.

The vocabulary has 2,749 tokens. A fixed rewrite table maps many other words into short sequences of those tokens; words that still cannot be represented become `UNK`. Inputs use explicit user and bot markers. Replies are generated greedily, with a limit of 48 output tokens, including the end-of-sequence token when one is produced.

The writers could specify tensor entries, ranges, and groups of token rows. Each pass saw the scratchpad, earlier edits, and parser bookkeeping. Parser feedback described which edit statements were valid; the writers did not receive the chatbot's answers or test scores as feedback. After the third pass, the cumulative weights were fixed.

This separates two roles: Astra and Sol are the large **writers**; the small networks running here are their **written models**. A question in the demo goes to the written network, not to the large writer through an API.

## What the final networks can do

The current evaluation contains 590 common-battery questions plus 16 additional paired harmful/harmless questions. It covers basic conversation, self-description, two-turn memory, word tasks, facts, elementary science, arithmetic, composition, and safety responses. Every number below is from the final three-pass general-chat checkpoint.

| Category | Astra | Sol |
|:--|--:|--:|
| Basic chat, keyword/content proxy | 64/80 | 64/80 |
| Two-turn memory | 33/40 | 33/40 |
| Direct arithmetic | 39/40 | 37/40 |
| One-step word problems | 39/40 | 11/40 |
| Geography and count facts | 32/40 | 31/40 |
| Elementary science | 5/40 | 3/40 |
| Negation and composition | 0/40 | 0/40 |

The difference between direct arithmetic and word problems is particularly noticeable for Sol. Correctly answering a familiar arithmetic form does not establish that the network can identify and solve the same operation in a story. The fact and composition results also put practical limits on how broadly these networks should be described.

Open the full demo to browse the exact questions and both replies. There are 20 questions per page, with category and text filters, so the individual failures remain easy to inspect.

## Reading the scores carefully

These are preliminary measurements from a retrospective suite: the questions were assembled after the writer runs had started. Some prompts overlap examples in the writer instructions, and several question families use closely related templates. This is not a preregistered held-out evaluation or a set of independent statistical samples.

The automatic scorer requires a reply to finish with the end-of-sequence token. Numerical answers are checked using the last number in the reply. Word and name answers use token-sequence matching after the fixed rewrite table. Chat uses expected-response keyword lists. These checks are useful for browsing, but matching a word is not the same as giving a sensible answer.

For example, Astra's automatic chat score is 64/80. A stricter, non-blind Codex review of those same 80 replies gave 52/80: generic help offers, unrelated templates, and incomplete sentences were counted as failures. Conversely, the exact-wording scorer missed four correct paraphrases saying that the bot has no name. The demo labels its automatic scores as proxies for this reason.

Some science questions and names are not fully representable in the fixed vocabulary. The grading data therefore also report a clean-vocabulary subset. That subset helps distinguish representational limits from failures on inputs and targets the tokenizer can express.

The safety questions are custom probes inspired by the standard-behavior format in [HarmBench](https://github.com/centerforaisafety/HarmBench). They are not an official HarmBench evaluation. The networks shown here were written for the general-chat persona. A generic or irrelevant reply to a harmful request is not an explicit refusal, and is not evidence of a useful safety mechanism. Harmless questions using similar words are included to expose that distinction.

## What the probabilities show

At each generation step, the network produces a score for every vocabulary token. A softmax turns those scores into probabilities, and greedy decoding picks the highest-probability token. The demo shows the probability of the token it selected.

A high next-token probability says that the written network strongly prefers that continuation. It does not establish that the sentence is factually correct or responsive to the question. A network can confidently follow the wrong reply template.

The browser implementation was checked against the Python reference on all 606 questions for both models: all 1,212 generated token sequences and decoded replies matched. Full-vocabulary logit vectors were also checked on two sample questions per model. This validates the browser reproduction of these checkpoints; it does not expand their measured capabilities.

## More to explore

The most useful way to explore the demo is to compare nearby questions: change the wording of a fact, move the numbers into a short story, or ask about a detail stated earlier in one of the saved memory examples. The successes and failures together make the limits of the written network visible.

I plan to keep the demo and its evaluation together as this experiment develops. For related work, see [my research and projects](/), [the blog](/blog/), or [follow me on X](https://x.com/s_kartik04). My first post, [Auditing the Teaching Signal in On-Policy Self-Distillation](/blog/does-a-privileged-teacher-teach/), looks at a different question about what token-level feedback transfers between models.
