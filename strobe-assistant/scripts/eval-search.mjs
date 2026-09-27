import { loadConfig } from "../src/shared/config.mjs";
import { searchUserMedia } from "../src/shared/vectors.mjs";

const config = await loadConfig();
const userId = process.argv[2] ?? config.heartbeatUserId;

// A small labelled set: query → which captions count as correct.
const CASES = [
    // Bare keywords (users type these)
    { query: "cats", expect: /cat|kitten/i },
    { query: "fireworks", expect: /firework/i },
    { query: "people in the water", expect: /people/i },
    { query: "something at the beach", expect: /people/i },

    // "A photo of ..." style
    { query: "A photo of a cat", expect: /cat|kitten/i },
    { query: "A photo of fireworks exploding at night", expect: /firework/i },
    { query: "A photo of people walking in shallow ocean water", expect: /people/i },

    // Scene style: what the agent will be told to write
    { query: "A cat's face up close", expect: /cat|kitten/i },
    { query: "Fireworks exploding in the night sky over a city", expect: /firework/i },
    { query: "People walking through shallow turquoise ocean water", expect: /people/i }
];

const rows = [];
let firstPlace = 0;

for (const { query, expect } of CASES) {
    const matches = await searchUserMedia({
        embeddingModelId: config.embeddingModelId,
        vectorBucket: config.vectorBucket,
        vectorIndex: config.vectorIndex,
        userId,
        query,
        topK: 10
    });

    const rank = matches.findIndex(m => expect.test(m.metadata.caption ?? "")) + 1;
    if (rank === 1) firstPlace++;

    rows.push({
        query: query.slice(0, 45),
        rank: rank || "missing",
        distance: rank ? +matches[rank - 1].distance.toFixed(3) : null,
        topResult: (matches[0]?.metadata.caption ?? "").slice(0, 40)
    });
}

console.table(rows);
console.log(`\n${firstPlace}/${CASES.length} queries ranked a correct photo first.`);