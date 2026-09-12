# Clusters, in prose

> 41 groups covering 98 repositories. Every pair scoring at least 0.68 semantic similarity is an edge, and Louvain modularity over the thresholded semantic edges partitions that graph into groups that are linked more densely inside than out.
>
> **These groupings are INFERRED.** They come from cosine distance between neural embeddings, not from anything measured in a tree. Density is a stronger claim than the connected components this used previously - a bridge repository no longer welds two unrelated neighbourhoods together - but a group of 4 still means 4 closely related projects, not 4 copies of one. Read a large group as a thread to pull, never as a list of duplicates to delete.

## What the numbers say

- 14 of the 41 groups cross a domain boundary. Those are the ones worth reading first: two repositories the classifier put in different parts of the estate that the embedding still pulled together.
- All 98 clustered repositories have been audited, so every keeper below was chosen against a grade rather than against a gap.
- No group is entirely unaudited, so there is no group whose keeper is a guess about a guess.

## How to use this

Each group names a keeper: the highest-graded member, breaking ties on stars and then on size. The rest are candidates for review, not for deletion - the grouping is a guess and the grade behind the keeper may be missing. The machine-readable form is /data/clusters.json. A single repository neighbourhood, including the EXTRACTED shared-dependency edges this report does not cover, is at /data/kin/<id>.json.

## Groups that cross a domain

### c001 - 4 repositories

Crosses a domain boundary: 2 AI & Data, 2 Web & Interfaces. That is the interesting case - the same shape of problem solved in two different parts of the estate.

Keeper: **OpenHands** (B-, 73.2). Mean grade across the 4 audited members is 60.8. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **OpenHands** | AI & Data | Python | B- 73.2 | 2658 |
| OpenJarvis | AI & Data | Python | C+ 68.6 | 1742 |
| Personal_AI_Infrastructure | Web & Interfaces | TypeScript | C- 59.2 | 1548 |
| learn-anything.xyz | Web & Interfaces | TypeScript | D 42.3 | 209 |

### c002 - 4 repositories

Crosses a domain boundary: 3 Systems & Infra, 1 AI & Data. That is the interesting case - the same shape of problem solved in two different parts of the estate.

Keeper: **stenoai** (C+, 65.1). Mean grade across the 4 audited members is 55.3. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **stenoai** | AI & Data | Python | C+ 65.1 | 62 |
| hyprnote | Systems & Infra | Rust | C 61.9 | 3671 |
| murmure | Systems & Infra | Rust | C- 50.9 | 435 |
| meetily | Systems & Infra | Rust | D 43.4 | 509 |

### c003 - 4 repositories

Crosses a domain boundary: 2 AI & Data, 1 Knowledge & Content, 1 Systems & Infra. That is the interesting case - the same shape of problem solved in two different parts of the estate.

Keeper: **Lead-Generation** (C, 60.8). Mean grade across the 4 audited members is 57. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **Lead-Generation** | AI & Data | Python | C 60.8 | 56 |
| googlemaps-scraper | Knowledge & Content |  | C- 58.6 | 93 |
| google-maps-scraper | Systems & Infra | Go | C- 56 | 90 |
| Google-Maps-Scrapper | AI & Data | Python | C- 52.8 | 6 |

### c004 - 4 repositories

Crosses a domain boundary: 3 Web & Interfaces, 1 Agent Skills & Plugins. That is the interesting case - the same shape of problem solved in two different parts of the estate.

Keeper: **obsidian-mind** (B+, 80.4). Mean grade across the 4 audited members is 78.7. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **obsidian-mind** | Agent Skills & Plugins | TypeScript | B+ 80.4 | 187 |
| open-second-brain | Web & Interfaces | TypeScript | B 79.9 | 2597 |
| MegaMemory | Web & Interfaces | TypeScript | B 79.3 | 44 |
| agentmemory | Web & Interfaces | TypeScript | B 75.2 | 208 |

### c011 - 3 repositories

Crosses a domain boundary: 1 AI & Data, 1 Systems & Infra, 1 Web & Interfaces. That is the interesting case - the same shape of problem solved in two different parts of the estate.

Keeper: **winpodx** (C, 62.6). Mean grade across the 3 audited members is 58.2. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **winpodx** | AI & Data | Python | C 62.6 | 502 |
| winboat | Web & Interfaces | TypeScript | C- 57.8 | 121 |
| winapps | Systems & Infra | Shell | C- 54.2 | 245 |

### c015 - 2 repositories

Crosses a domain boundary: 1 Agent Skills & Plugins, 1 Web & Interfaces. That is the interesting case - the same shape of problem solved in two different parts of the estate.

Keeper: **mercury-agent-skills** (B, 75.3). Mean grade across the 2 audited members is 71.9. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **mercury-agent-skills** | Web & Interfaces | JavaScript | B 75.3 | 151 |
| agent-skills | Agent Skills & Plugins | Shell | C+ 68.5 | 56 |

### c023 - 2 repositories

Crosses a domain boundary: 1 AI & Data, 1 Mobile. That is the interesting case - the same shape of problem solved in two different parts of the estate.

Keeper: **mlx-audio** (B-, 70.1). Mean grade across the 2 audited members is 69.1. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **mlx-audio** | AI & Data | Python | B- 70.1 | 574 |
| mlx-audio-swift | Mobile | Swift | C+ 68.1 | 97 |

### c026 - 2 repositories

Crosses a domain boundary: 1 Mobile, 1 Systems & Infra. That is the interesting case - the same shape of problem solved in two different parts of the estate.

Keeper: **android-sms-gateway** (C-, 58.6). Mean grade across the 2 audited members is 51.3. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **android-sms-gateway** | Mobile | Kotlin | C- 58.6 | 335 |
| httpsms | Systems & Infra | Go | D 43.9 | 430 |

### c032 - 2 repositories

Crosses a domain boundary: 1 Agent Skills & Plugins, 1 Systems & Infra. That is the interesting case - the same shape of problem solved in two different parts of the estate.

Keeper: **ai-job-search** (B+, 82.3). Mean grade across the 2 audited members is 68.3. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **ai-job-search** | Agent Skills & Plugins | TypeScript | B+ 82.3 | 212 |
| career-ops | Systems & Infra | Go | C- 54.2 | 99 |

### c034 - 2 repositories

Crosses a domain boundary: 1 AI & Data, 1 Web & Interfaces. That is the interesting case - the same shape of problem solved in two different parts of the estate.

Keeper: **llmwiki** (B-, 74.6). Mean grade across the 2 audited members is 69.1. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **llmwiki** | AI & Data | Python | B- 74.6 | 300 |
| llm_wiki | Web & Interfaces | TypeScript | C 63.6 | 227 |

### c035 - 2 repositories

Crosses a domain boundary: 1 Agent Skills & Plugins, 1 Web & Interfaces. That is the interesting case - the same shape of problem solved in two different parts of the estate.

Keeper: **lich-skills** (B, 75.4). Mean grade across the 2 audited members is 73.4. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **lich-skills** | Agent Skills & Plugins | Shell | B 75.4 | 46 |
| agentskills | Web & Interfaces | JavaScript | B- 71.4 | 187 |

### c037 - 2 repositories

Crosses a domain boundary: 1 AI & Data, 1 Web & Interfaces. That is the interesting case - the same shape of problem solved in two different parts of the estate.

Keeper: **VoiceStudio** (C+, 69.3). Mean grade across the 2 audited members is 62.8. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **VoiceStudio** | AI & Data | Python | C+ 69.3 | 2062 |
| voicebox | Web & Interfaces | TSX | C- 56.4 | 677 |

### c038 - 2 repositories

Crosses a domain boundary: 1 AI & Data, 1 Systems & Infra. That is the interesting case - the same shape of problem solved in two different parts of the estate.

Keeper: **flashvad** (B+, 80.7). Mean grade across the 2 audited members is 67. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **flashvad** | AI & Data | Python | B+ 80.7 | 166 |
| ten-vad | Systems & Infra | C/C++ Header | C- 53.2 | 147 |

### c040 - 2 repositories

Crosses a domain boundary: 1 Agent Skills & Plugins, 1 Web & Interfaces. That is the interesting case - the same shape of problem solved in two different parts of the estate.

Keeper: **no-ai-slop** (B-, 74.5). Mean grade across the 2 audited members is 69.8. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **no-ai-slop** | Agent Skills & Plugins | Python | B- 74.5 | 13 |
| avoid-ai-writing | Web & Interfaces | JavaScript | C+ 65.2 | 50 |

## Groups inside a single domain

### c005 - 3 repositories

All 3 in Web & Interfaces.

Keeper: **continue** (C+, 68.1). Mean grade across the 3 audited members is 60.7. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **continue** | Web & Interfaces | TypeScript | C+ 68.1 | 3058 |
| oh-my-openagent | Web & Interfaces | TypeScript | C 60.5 | 6746 |
| opencode | Web & Interfaces | TypeScript | C- 53.4 | 2755 |

### c006 - 3 repositories

All 3 in Web & Interfaces.

Keeper: **BeautySmart** (C+, 66.7). Mean grade across the 3 audited members is 52.9. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **BeautySmart** | Web & Interfaces | PHP | C+ 66.7 | 6221 |
| Multi-Beauty-Salon-Web-Application-In-ReactJS-Firebase | Web & Interfaces | TypeScript | D 47.6 | 23896 |
| Salon-Management-System | Web & Interfaces | PHP | D 44.5 | 170 |

### c007 - 3 repositories

All 3 in Web & Interfaces.

Keeper: **n8n** (C+, 65.8). Mean grade across the 3 audited members is 62. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **n8n** | Web & Interfaces | TypeScript | C+ 65.8 | 17556 |
| n8n-as-code | Web & Interfaces | TypeScript | C 60.6 | 357 |
| VibeWorkflowPlatform | Web & Interfaces | TypeScript | C- 59.6 | 2203 |

### c008 - 3 repositories

All 3 in AI & Data.

Keeper: **FinRL** (C, 64.1). Mean grade across the 3 audited members is 52.8. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **FinRL** | AI & Data | Python | C 64.1 | 195 |
| tensortrade | AI & Data | Python | C- 53.8 | 153 |
| TradeMaster | AI & Data | Python | D 40.5 | 776 |

### c009 - 3 repositories

All 3 in Mobile.

Keeper: **FluidVoice** (C, 61.9). Mean grade across the 3 audited members is 57.4. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **FluidVoice** | Mobile | Swift | C 61.9 | 186 |
| VoiceInk | Mobile | Swift | C- 55.8 | 231 |
| pindrop | Mobile | Swift | C- 54.5 | 569 |

### c010 - 3 repositories

All 3 in AI & Data.

Keeper: **MARM-Systems** (C, 63.1). Mean grade across the 3 audited members is 61.2. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **MARM-Systems** | AI & Data | Python | C 63.1 | 124 |
| MemMachine | AI & Data | Python | C 62.3 | 706 |
| mcp-memory-service | AI & Data | Python | C- 58.1 | 1147 |

### c012 - 3 repositories

All 3 in Web & Interfaces.

Keeper: **manaflow** (C+, 69.1). Mean grade across the 3 audited members is 62.7. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **manaflow** | Web & Interfaces | TypeScript | C+ 69.1 | 1730 |
| dmux | Web & Interfaces | TypeScript | C 62.2 | 794 |
| parallel-code | Web & Interfaces | TypeScript | C- 56.8 | 254 |

### c013 - 2 repositories

All 2 in AI & Data.

Keeper: **YOLOv8_Segmentation_DeepSORT_TRACKING_SpeedEstimation** (C-, 51.6). Mean grade across the 2 audited members is 49.5. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **YOLOv8_Segmentation_DeepSORT_TRACKING_SpeedEstimation** | AI & Data | Jupyter Notebook | C- 51.6 | 2 |
| ObjectCountingYOLOv8DeepSORT | AI & Data | Jupyter Notebook | D 47.4 | 2 |

### c014 - 2 repositories

All 2 in Web & Interfaces.

Keeper: **maplibre-gl-usgs-lidar** (C+, 66.7). Mean grade across the 2 audited members is 65.8. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **maplibre-gl-usgs-lidar** | Web & Interfaces | TypeScript | C+ 66.7 | 44 |
| maplibre-gl-lidar | Web & Interfaces | TypeScript | C+ 65 | 69 |

### c016 - 2 repositories

All 2 in Web & Interfaces.

Keeper: **Manta** (B+, 82.2). Mean grade across the 2 audited members is 73.1. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **Manta** | Web & Interfaces | JSX | B+ 82.2 | 374 |
| invoice-builder | Web & Interfaces | TypeScript | C 64 | 509 |

### c017 - 2 repositories

All 2 in AI & Data.

Keeper: **AgenticTrading** (C, 61.3). Mean grade across the 2 audited members is 57.3. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **AgenticTrading** | AI & Data | Python | C 61.3 | 539 |
| TradingAgents | AI & Data | Python | C- 53.4 | 73 |

### c018 - 2 repositories

All 2 in Web & Interfaces.

Keeper: **altersend** (C+, 69.9). Mean grade across the 2 audited members is 62.5. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **altersend** | Web & Interfaces | TypeScript | C+ 69.9 | 1029 |
| alt-sendme | Web & Interfaces | TypeScript | C- 55 | 116 |

### c019 - 2 repositories

All 2 in Web & Interfaces.

Keeper: **openskills** (B+, 82.4). Mean grade across the 2 audited members is 77.2. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **openskills** | Web & Interfaces | TypeScript | B+ 82.4 | 94 |
| skills | Web & Interfaces | TypeScript | B- 72 | 67 |

### c020 - 2 repositories

All 2 in AI & Data.

Keeper: **livecc** (D, 46.3). Mean grade across the 2 audited members is 43.8. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **livecc** | AI & Data | Python | D 46.3 | 95 |
| VideoAgent | AI & Data | Python | D 41.3 | 853 |

### c021 - 2 repositories

All 2 in AI & Data.

Keeper: **graph_maker** (C, 62.9). Mean grade across the 2 audited members is 59.3. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **graph_maker** | AI & Data | Jupyter Notebook | C 62.9 | 16 |
| knowledge_graph | AI & Data | Jupyter Notebook | C- 55.7 | 42 |

### c022 - 2 repositories

All 2 in AI & Data.

Keeper: **awesome-ai-apps** (D, 47.9). Mean grade across the 2 audited members is 47.8. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **awesome-ai-apps** | AI & Data | Python | D 47.9 | 666 |
| awesome-llm-apps | AI & Data | Python | D 47.7 | 1073 |

### c024 - 2 repositories

All 2 in AI & Data.

Keeper: **client-python** (B, 78.1). Mean grade across the 2 audited members is 70. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **client-python** | AI & Data | Python | B 78.1 | 301 |
| twelvedata-python | AI & Data | Python | C 62 | 40 |

### c025 - 2 repositories

All 2 in Web & Interfaces.

Keeper: **pluely** (C-, 59.6). Mean grade across the 2 audited members is 49.8. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **pluely** | Web & Interfaces | TSX | C- 59.6 | 224 |
| natively-cluely-ai-assistant | Web & Interfaces | TypeScript | D 40 | 182 |

### c027 - 2 repositories

All 2 in Web & Interfaces.

Keeper: **FileSync** (C, 62.5). Mean grade across the 2 audited members is 60.5. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **FileSync** | Web & Interfaces | JavaScript | C 62.5 | 44 |
| OpenDrop | Web & Interfaces | JavaScript | C- 58.4 | 12 |

### c028 - 2 repositories

All 2 in AI & Data.

Keeper: **public-apis** (B+, 80). Mean grade across the 2 audited members is 71.3. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **public-apis** | AI & Data | Python | B+ 80 | 22 |
| awesome-opensource-ai | AI & Data | Python | C 62.6 | 8 |

### c029 - 2 repositories

All 2 in AI & Data.

Keeper: **cadquery** (B-, 71.5). Mean grade across the 2 audited members is 70.9. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **cadquery** | AI & Data | Python | B- 71.5 | 209 |
| build123d | AI & Data | Python | B- 70.3 | 649 |

### c030 - 2 repositories

All 2 in AI & Data.

Keeper: **gpu-hot** (C, 62.9). Mean grade across the 2 audited members is 52.6. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **gpu-hot** | AI & Data | Python | C 62.9 | 68 |
| nvitop | AI & Data | Python | D 42.3 | 116 |

### c031 - 2 repositories

All 2 in Systems & Infra.

Keeper: **rust-genai** (C+, 67.2). Mean grade across the 2 audited members is 66.3. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **rust-genai** | Systems & Infra | Rust | C+ 67.2 | 187 |
| aisix | Systems & Infra | Rust | C+ 65.4 | 526 |

### c033 - 2 repositories

All 2 in Web & Interfaces.

Keeper: **paseo** (B-, 71.4). Mean grade across the 2 audited members is 66.2. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **paseo** | Web & Interfaces | TypeScript | B- 71.4 | 1647 |
| orca | Web & Interfaces | TypeScript | C 61 | 6335 |

### c036 - 2 repositories

All 2 in Web & Interfaces.

Keeper: **atomic-mail-agentic** (B-, 70.9). Mean grade across the 2 audited members is 69.9. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **atomic-mail-agentic** | Web & Interfaces | TypeScript | B- 70.9 | 424 |
| mails | Web & Interfaces | TypeScript | C+ 68.9 | 91 |

### c039 - 2 repositories

All 2 in Web & Interfaces.

Keeper: **decimen-optical-transfer** (C+, 69). Mean grade across the 2 audited members is 66.5. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **decimen-optical-transfer** | Web & Interfaces | TypeScript | C+ 69 | 19 |
| qr-data-transfer | Web & Interfaces | TypeScript | C 64.1 | 44 |

### c041 - 2 repositories

All 2 in Mobile.

Keeper: **AIUsage** (C+, 69.2). Mean grade across the 2 audited members is 66.1. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **AIUsage** | Mobile | Swift | C+ 69.2 | 459 |
| quotio | Mobile | Swift | C 63 | 277 |

---

Generated from data/clusters.json built 2026-09-12. Regenerate with `node src/stages/build-relations.js`.
