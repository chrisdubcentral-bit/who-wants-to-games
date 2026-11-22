---
name: add-questions
description: Write new quiz questions from a web page and add them to an edition's Pending list. Use when the user gives a URL (or several) and asks for questions for an edition, e.g. "make questions from this page for Celtic", "add 30 Beatles questions from <url>", "add these to pending".
argument-hint: <edition> <url> [how many] [difficulty or topic]
---

# Add questions from a web page

The user supplies a source page and an edition. You read the page, write a batch of questions as a text file, and add them to the edition's `pending-questions.json` with `tools/add-questions.mjs`. Never edit the question JSON files by hand.

## 0. Gather requirements

Ask the user for these details (use AskUserQuestion or ask directly in conversation):

1. **What Game Edition?** Which edition to add questions to (e.g., `celtic`, `beatles`)?
2. **Supply the URL?** One or more source URLs to fetch content from.
3. **Do you want to crawl sub-pages?** (Yes/No) If yes, the skill will search for related pages under the same domain.
4. **Any specific questions or particular fields?** (Optional) Any topic, time period, players, or specific focus for the questions?
5. **How many questions?** (Default: 20) How many questions to generate?

Confirm these inputs with the user before proceeding.

## 1. Work out the request

From the gathered inputs, establish:

- **Edition.** A folder in `editions/`, such as `celtic` or `beatles`.
- **Source.** One or more URLs, potentially expanded if sub-page crawling is enabled.
- **Crawl subpages.** Boolean flag for whether to search related pages on the same domain.
- **How many.** Number of questions to generate (default 20).
- **Focus.** An optional topic or difficulty, such as "hard ones" or "only the 1967 final".

## 2. Read the edition

In `editions/<ed>/data/`:

- `meta/categories.json`. Use only the `key` values of categories with `"active": true`. Pick the one that fits each question best.
- `meta/stages.json`. Each stage has a difficulty range. The tool picks the stage from the difficulty, so you only set the difficulty.
- `edition.json`. It sets the edition's tone and wording.
- `questions/approved-questions.json`, `pending-questions.json` and `rejected-questions.json`. Search them for the source's topic, for example with Grep on a player or album name. Write questions on facts that aren't already covered. Don't reword existing questions.
- `imports/`. Find the highest `batch-<N>-…` number there. The new batch is N+1.

## 3. Read the source

**If sub-page crawling is enabled:** Discover related pages on the same domain by:
- Fetching the main URL and looking for navigation links, indexes, or related content
- Identifying pages that match the topic or focus
- Fetching up to 5-10 related subpages (avoid excessive crawling)

**For all URLs (crawled or provided):** Fetch each with WebFetch, or the web-fetch agent if there is no WebFetch tool. Ask it for facts in detail: names, dates, numbers, scores, places, firsts and records.

- Use only facts the sources state. Don't fill gaps from memory.
- If a source contradicts itself or looks wrong, leave that fact out and say so in your report.
- **Transfermarkt:** treat appearance and goal totals from before about 1990 as unreliable. Stats after a player moved clubs or a club split are also often wrong. See the saved Transfermarkt note if it is in memory.

## 4. Write the batch file

Save it as `editions/<ed>/data/imports/batch-<N>-<short-topic>.txt`, for example `batch-15-lisbon-1967.txt`:

```
# <Topic>. Source: <URL>
# difficulty | category | question | correct | wrong | wrong | wrong | tags
3 | cup-finals | Who scored Celtic's winning goal in the 1967 European Cup final? | Stevie Chalmers | Tommy Gemmell | Bobby Lennox | Willie Wallace | Lisbon 1967; Stevie Chalmers
```

One question per line, with fields separated by ` | `. The correct answer always goes first, because the tool shuffles the answers. Tags are separated by `; `.

Rules for each question:

- **Length.** The question is 15 to 250 characters and ends with `?`. Each answer is 80 characters or fewer. Keep questions short enough to read quickly on a phone.
- **One right answer.** Exactly one answer is correct, and the source states it. Avoid "first", "most" or "only" unless the source says so outright.
- **Good wrong answers.** The three wrong answers are the same kind of thing as the right one: other years for a year, other players from the same era for a player, other grounds for a ground. They are plausible but definitely wrong, and all four answers are different.
- **No tricks.** Don't write "which of these", "all of the above", "none of these" or negative questions such as "who did NOT…". Don't give the answer away in the question.
- **Wording.** Use British spelling and the edition's names and terms.
- **Difficulty.** Use 1 to 5. 1 is a fact any fan knows, 3 is for a keen fan, and 5 is deep trivia. Spread the batch across 1 to 5 unless the user asked for a focus. Make sure the early rounds, difficulty 1 and 2, get some questions, because they need the most.
- **Tags.** Name the people, places, seasons and events, so the Question Review search finds them.
- **Mix it up.** Vary the question types (who, when, where, how many, what) and the categories.

## 5. Dry run

```
node tools/add-questions.mjs <ed> editions/<ed>/data/imports/batch-<N>-<topic>.txt --dry
```

If any line has a problem, the tool writes nothing. Fix every line it reports and run it again until it passes. If it lists a question as "similar" to an existing one with the same answer, reword or drop it unless it truly asks something different. Check that the spread by difficulty looks sensible.

## 6. Add the questions

Run the same command without `--dry`. It appends the questions to `pending-questions.json` with new ids, and saves `imports/batch-<N>-<topic>.json` beside the text file.

## 7. Report back

Tell the user:

- how many questions were added, how many were already there, and how many were flagged as similar
- the spread by difficulty
- the batch file name
- any facts you left out because the source was unclear

Remind them the questions are **Pending**. They need approving on the edition's Question Review page (`editions/<ed>/admin-review.html`), then publishing from that page.

Don't approve questions, commit or deploy unless the user asks.
