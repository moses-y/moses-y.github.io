# Clusters, in prose

> 42 groups covering 109 repositories. Every pair scoring at least 0.68 semantic similarity is an edge, and Louvain modularity over the thresholded semantic edges partitions that graph into groups that are linked more densely inside than out.
>
> **These groupings are INFERRED.** They come from cosine distance between neural embeddings, not from anything measured in a tree. Density is a stronger claim than the connected components this used previously - a bridge repository no longer welds two unrelated neighbourhoods together - but a group of 9 still means 9 closely related projects, not 9 copies of one. Read a large group as a thread to pull, never as a list of duplicates to delete.

## What the numbers say

- 17 of the 42 groups cross a domain boundary. Those are the ones worth reading first: two repositories the classifier put in different parts of the estate that the embedding still pulled together.
- All 109 clustered repositories have been audited, so every keeper below was chosen against a grade rather than against a gap.
- No group is entirely unaudited, so there is no group whose keeper is a guess about a guess.

## How to use this

Each group names a keeper: the highest-graded member, breaking ties on stars and then on size. The rest are candidates for review, not for deletion - the grouping is a guess and the grade behind the keeper may be missing. The machine-readable form is /data/clusters.json. A single repository neighbourhood, including the EXTRACTED shared-dependency edges this report does not cover, is at /data/kin/<id>.json.

## Groups that cross a domain

### c001 - 9 repositories

Crosses a domain boundary: 8 Web & Interfaces, 1 AI & Data. That is the interesting case - the same shape of problem solved in two different parts of the estate.

Keeper: **cezar** (B, 78.8). Mean grade across the 9 audited members is 66. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **cezar** | Web & Interfaces | TypeScript | B 78.8 | 1915 |
| agent-orchestrator | Web & Interfaces | TypeScript | B 78 | 315 |
| paseo | Web & Interfaces | TypeScript | B- 71.1 | 1647 |
| manaflow | Web & Interfaces | TypeScript | C+ 68.8 | 1730 |
| mco | AI & Data | Python | C+ 65.9 | 568 |
| dmux | Web & Interfaces | TypeScript | C 61.8 | 794 |
| orca | Web & Interfaces | TypeScript | C 60.7 | 6335 |
| parallel-code | Web & Interfaces | TypeScript | C- 56.4 | 254 |
| Maestro | Web & Interfaces | TypeScript | C- 52.8 | 1456 |

### c002 - 4 repositories

Crosses a domain boundary: 2 AI & Data, 2 Web & Interfaces. That is the interesting case - the same shape of problem solved in two different parts of the estate.

Keeper: **OpenHands** (B-, 72.8). Mean grade across the 4 audited members is 60.4. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **OpenHands** | AI & Data | Python | B- 72.8 | 2658 |
| OpenJarvis | AI & Data | Python | C+ 68.2 | 1742 |
| Personal_AI_Infrastructure | Web & Interfaces | TypeScript | C- 58.9 | 1548 |
| learn-anything.xyz | Web & Interfaces | TypeScript | D 41.8 | 209 |

### c003 - 4 repositories

Crosses a domain boundary: 3 Systems & Infra, 1 AI & Data. That is the interesting case - the same shape of problem solved in two different parts of the estate.

Keeper: **stenoai** (C, 64.6). Mean grade across the 4 audited members is 54.9. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **stenoai** | AI & Data | Python | C 64.6 | 62 |
| hyprnote | Systems & Infra | Rust | C 61.6 | 3671 |
| murmure | Systems & Infra | Rust | C- 50.6 | 435 |
| meetily | Systems & Infra | Rust | D 43 | 509 |

### c004 - 4 repositories

Crosses a domain boundary: 3 Mobile, 1 AI & Data. That is the interesting case - the same shape of problem solved in two different parts of the estate.

Keeper: **FluidVoice** (C, 61.6). Mean grade across the 4 audited members is 55.5. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **FluidVoice** | Mobile | Swift | C 61.6 | 186 |
| VoiceInk | Mobile | Swift | C- 55.5 | 231 |
| pindrop | Mobile | Swift | C- 54.1 | 569 |
| lipflow | AI & Data | Python | C- 50.8 | 87 |

### c005 - 4 repositories

Crosses a domain boundary: 2 AI & Data, 1 Knowledge & Content, 1 Systems & Infra. That is the interesting case - the same shape of problem solved in two different parts of the estate.

Keeper: **Lead-Generation** (C, 60.5). Mean grade across the 4 audited members is 56.8. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **Lead-Generation** | AI & Data | Python | C 60.5 | 56 |
| googlemaps-scraper | Knowledge & Content |  | C- 58.1 | 93 |
| google-maps-scraper | Systems & Infra | Go | C- 55.7 | 90 |
| Google-Maps-Scrapper | AI & Data | Python | C- 52.7 | 6 |

### c007 - 4 repositories

Crosses a domain boundary: 3 Web & Interfaces, 1 Agent Skills & Plugins. That is the interesting case - the same shape of problem solved in two different parts of the estate.

Keeper: **obsidian-mind** (B+, 80). Mean grade across the 4 audited members is 78.3. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **obsidian-mind** | Agent Skills & Plugins | TypeScript | B+ 80 | 187 |
| open-second-brain | Web & Interfaces | TypeScript | B 79.5 | 2597 |
| MegaMemory | Web & Interfaces | TypeScript | B 78.9 | 44 |
| agentmemory | Web & Interfaces | TypeScript | B- 74.8 | 208 |

### c012 - 3 repositories

Crosses a domain boundary: 1 AI & Data, 1 Systems & Infra, 1 Web & Interfaces. That is the interesting case - the same shape of problem solved in two different parts of the estate.

Keeper: **winpodx** (C, 62.4). Mean grade across the 3 audited members is 57.9. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **winpodx** | AI & Data | Python | C 62.4 | 502 |
| winboat | Web & Interfaces | TypeScript | C- 57.3 | 121 |
| winapps | Systems & Infra | Shell | C- 53.9 | 245 |

### c016 - 2 repositories

Crosses a domain boundary: 1 Agent Skills & Plugins, 1 Web & Interfaces. That is the interesting case - the same shape of problem solved in two different parts of the estate.

Keeper: **mercury-agent-skills** (B, 75). Mean grade across the 2 audited members is 71.5. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **mercury-agent-skills** | Web & Interfaces | JavaScript | B 75 | 151 |
| agent-skills | Agent Skills & Plugins | Shell | C+ 68.1 | 56 |

### c024 - 2 repositories

Crosses a domain boundary: 1 AI & Data, 1 Mobile. That is the interesting case - the same shape of problem solved in two different parts of the estate.

Keeper: **mlx-audio** (C+, 69.7). Mean grade across the 2 audited members is 68.7. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **mlx-audio** | AI & Data | Python | C+ 69.7 | 574 |
| mlx-audio-swift | Mobile | Swift | C+ 67.7 | 97 |

### c027 - 2 repositories

Crosses a domain boundary: 1 Mobile, 1 Systems & Infra. That is the interesting case - the same shape of problem solved in two different parts of the estate.

Keeper: **android-sms-gateway** (C-, 58.3). Mean grade across the 2 audited members is 50.9. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **android-sms-gateway** | Mobile | Kotlin | C- 58.3 | 335 |
| httpsms | Systems & Infra | Go | D 43.5 | 430 |

### c033 - 2 repositories

Crosses a domain boundary: 1 Agent Skills & Plugins, 1 Systems & Infra. That is the interesting case - the same shape of problem solved in two different parts of the estate.

Keeper: **ai-job-search** (B+, 82.3). Mean grade across the 2 audited members is 68.2. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **ai-job-search** | Agent Skills & Plugins | TypeScript | B+ 82.3 | 212 |
| career-ops | Systems & Infra | Go | C- 54.1 | 99 |

### c034 - 2 repositories

Crosses a domain boundary: 1 AI & Data, 1 Web & Interfaces. That is the interesting case - the same shape of problem solved in two different parts of the estate.

Keeper: **llmwiki** (B-, 74.3). Mean grade across the 2 audited members is 68.8. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **llmwiki** | AI & Data | Python | B- 74.3 | 300 |
| llm_wiki | Web & Interfaces | TypeScript | C 63.2 | 227 |

### c035 - 2 repositories

Crosses a domain boundary: 1 Agent Skills & Plugins, 1 Web & Interfaces. That is the interesting case - the same shape of problem solved in two different parts of the estate.

Keeper: **lich-skills** (B, 75). Mean grade across the 2 audited members is 73. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **lich-skills** | Agent Skills & Plugins | Shell | B 75 | 46 |
| agentskills | Web & Interfaces | JavaScript | B- 71.1 | 187 |

### c037 - 2 repositories

Crosses a domain boundary: 1 AI & Data, 1 Web & Interfaces. That is the interesting case - the same shape of problem solved in two different parts of the estate.

Keeper: **VoiceStudio** (C+, 66.6). Mean grade across the 2 audited members is 61.3. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **VoiceStudio** | AI & Data | Python | C+ 66.6 | 2062 |
| voicebox | Web & Interfaces | TSX | C- 56 | 677 |

### c038 - 2 repositories

Crosses a domain boundary: 1 AI & Data, 1 Systems & Infra. That is the interesting case - the same shape of problem solved in two different parts of the estate.

Keeper: **flashvad** (B+, 80.4). Mean grade across the 2 audited members is 66.6. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **flashvad** | AI & Data | Python | B+ 80.4 | 166 |
| ten-vad | Systems & Infra | C/C++ Header | C- 52.7 | 147 |

### c040 - 2 repositories

Crosses a domain boundary: 1 Agent Skills & Plugins, 1 Web & Interfaces. That is the interesting case - the same shape of problem solved in two different parts of the estate.

Keeper: **no-ai-slop** (B-, 74.1). Mean grade across the 2 audited members is 69.5. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **no-ai-slop** | Agent Skills & Plugins | Python | B- 74.1 | 13 |
| avoid-ai-writing | Web & Interfaces | JavaScript | C+ 65 | 50 |

### c042 - 2 repositories

Crosses a domain boundary: 1 Systems & Infra, 1 Web & Interfaces. That is the interesting case - the same shape of problem solved in two different parts of the estate.

Keeper: **free-for-dev** (C+, 67.7). Mean grade across the 2 audited members is 65.2. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **free-for-dev** | Web & Interfaces | HTML | C+ 67.7 | 10 |
| free-for-devs | Systems & Infra |  | C 62.7 | 3 |

## Groups inside a single domain

### c006 - 4 repositories

All 4 in AI & Data.

Keeper: **forgetful** (B-, 71.5). Mean grade across the 4 audited members is 63.5. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **forgetful** | AI & Data | Python | B- 71.5 | 379 |
| MARM-Systems | AI & Data | Python | C 62.8 | 124 |
| MemMachine | AI & Data | Python | C 62 | 706 |
| mcp-memory-service | AI & Data | Python | C- 57.7 | 1147 |

### c008 - 3 repositories

All 3 in Web & Interfaces.

Keeper: **continue** (C+, 68). Mean grade across the 3 audited members is 60.4. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **continue** | Web & Interfaces | TypeScript | C+ 68 | 3058 |
| oh-my-openagent | Web & Interfaces | TypeScript | C 60.2 | 6746 |
| opencode | Web & Interfaces | TypeScript | C- 53 | 2755 |

### c009 - 3 repositories

All 3 in Web & Interfaces.

Keeper: **BeautySmart** (C+, 66.3). Mean grade across the 3 audited members is 52.6. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **BeautySmart** | Web & Interfaces | PHP | C+ 66.3 | 6221 |
| Multi-Beauty-Salon-Web-Application-In-ReactJS-Firebase | Web & Interfaces | TypeScript | D 47.3 | 23896 |
| Salon-Management-System | Web & Interfaces | PHP | D 44.2 | 170 |

### c010 - 3 repositories

All 3 in Web & Interfaces.

Keeper: **n8n** (C+, 65.4). Mean grade across the 3 audited members is 61.6. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **n8n** | Web & Interfaces | TypeScript | C+ 65.4 | 17556 |
| n8n-as-code | Web & Interfaces | TypeScript | C 60.3 | 357 |
| VibeWorkflowPlatform | Web & Interfaces | TypeScript | C- 59.2 | 2203 |

### c011 - 3 repositories

All 3 in AI & Data.

Keeper: **FinRL** (C, 63.7). Mean grade across the 3 audited members is 52.4. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **FinRL** | AI & Data | Python | C 63.7 | 195 |
| tensortrade | AI & Data | Python | C- 53.5 | 153 |
| TradeMaster | AI & Data | Python | D 40.1 | 776 |

### c013 - 3 repositories

All 3 in Systems & Infra.

Keeper: **free-my-tv** (C, 61.3). Mean grade across the 3 audited members is 56.7. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **free-my-tv** | Systems & Infra | Java | C 61.3 | 106 |
| unbloat-android-tv | Systems & Infra | Shell | C- 54.4 | 44 |
| cleanyourtv | Systems & Infra | Java | C- 54.3 | 327 |

### c014 - 2 repositories

All 2 in AI & Data.

Keeper: **YOLOv8_Segmentation_DeepSORT_TRACKING_SpeedEstimation** (C-, 51). Mean grade across the 2 audited members is 49.2. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **YOLOv8_Segmentation_DeepSORT_TRACKING_SpeedEstimation** | AI & Data | Jupyter Notebook | C- 51 | 2 |
| ObjectCountingYOLOv8DeepSORT | AI & Data | Jupyter Notebook | D 47.4 | 2 |

### c015 - 2 repositories

All 2 in Web & Interfaces.

Keeper: **maplibre-gl-usgs-lidar** (C+, 66.3). Mean grade across the 2 audited members is 65.4. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **maplibre-gl-usgs-lidar** | Web & Interfaces | TypeScript | C+ 66.3 | 44 |
| maplibre-gl-lidar | Web & Interfaces | TypeScript | C 64.6 | 69 |

### c017 - 2 repositories

All 2 in Web & Interfaces.

Keeper: **Manta** (B+, 81.8). Mean grade across the 2 audited members is 72.7. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **Manta** | Web & Interfaces | JSX | B+ 81.8 | 374 |
| invoice-builder | Web & Interfaces | TypeScript | C 63.6 | 509 |

### c018 - 2 repositories

All 2 in AI & Data.

Keeper: **AgenticTrading** (C, 60.9). Mean grade across the 2 audited members is 57. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **AgenticTrading** | AI & Data | Python | C 60.9 | 539 |
| TradingAgents | AI & Data | Python | C- 53 | 73 |

### c019 - 2 repositories

All 2 in Web & Interfaces.

Keeper: **altersend** (C+, 69.7). Mean grade across the 2 audited members is 62.2. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **altersend** | Web & Interfaces | TypeScript | C+ 69.7 | 1029 |
| alt-sendme | Web & Interfaces | TypeScript | C- 54.6 | 116 |

### c020 - 2 repositories

All 2 in Web & Interfaces.

Keeper: **openskills** (B+, 82.1). Mean grade across the 2 audited members is 76.8. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **openskills** | Web & Interfaces | TypeScript | B+ 82.1 | 94 |
| skills | Web & Interfaces | TypeScript | B- 71.6 | 67 |

### c021 - 2 repositories

All 2 in AI & Data.

Keeper: **livecc** (D, 46). Mean grade across the 2 audited members is 43.4. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **livecc** | AI & Data | Python | D 46 | 95 |
| VideoAgent | AI & Data | Python | D 40.8 | 853 |

### c022 - 2 repositories

All 2 in AI & Data.

Keeper: **graph_maker** (C, 62.4). Mean grade across the 2 audited members is 58.8. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **graph_maker** | AI & Data | Jupyter Notebook | C 62.4 | 16 |
| knowledge_graph | AI & Data | Jupyter Notebook | C- 55.2 | 42 |

### c023 - 2 repositories

All 2 in AI & Data.

Keeper: **awesome-ai-apps** (D, 47.5). Mean grade across the 2 audited members is 47.5. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **awesome-ai-apps** | AI & Data | Python | D 47.5 | 666 |
| awesome-llm-apps | AI & Data | Python | D 47.4 | 1073 |

### c025 - 2 repositories

All 2 in AI & Data.

Keeper: **client-python** (B, 77.7). Mean grade across the 2 audited members is 69.7. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **client-python** | AI & Data | Python | B 77.7 | 301 |
| twelvedata-python | AI & Data | Python | C 61.6 | 40 |

### c026 - 2 repositories

All 2 in Web & Interfaces.

Keeper: **pluely** (C-, 59.2). Mean grade across the 2 audited members is 49.5. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **pluely** | Web & Interfaces | TSX | C- 59.2 | 224 |
| natively-cluely-ai-assistant | Web & Interfaces | TypeScript | F 39.7 | 182 |

### c028 - 2 repositories

All 2 in Web & Interfaces.

Keeper: **FileSync** (C, 62). Mean grade across the 2 audited members is 60. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **FileSync** | Web & Interfaces | JavaScript | C 62 | 44 |
| OpenDrop | Web & Interfaces | JavaScript | C- 58 | 12 |

### c029 - 2 repositories

All 2 in AI & Data.

Keeper: **public-apis** (B, 79.7). Mean grade across the 2 audited members is 71. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **public-apis** | AI & Data | Python | B 79.7 | 22 |
| awesome-opensource-ai | AI & Data | Python | C 62.2 | 8 |

### c030 - 2 repositories

All 2 in AI & Data.

Keeper: **cadquery** (B-, 71.2). Mean grade across the 2 audited members is 70.6. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **cadquery** | AI & Data | Python | B- 71.2 | 209 |
| build123d | AI & Data | Python | B- 70 | 649 |

### c031 - 2 repositories

All 2 in AI & Data.

Keeper: **gpu-hot** (C, 62.4). Mean grade across the 2 audited members is 52.2. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **gpu-hot** | AI & Data | Python | C 62.4 | 68 |
| nvitop | AI & Data | Python | D 42 | 116 |

### c032 - 2 repositories

All 2 in Systems & Infra.

Keeper: **rust-genai** (C+, 66.8). Mean grade across the 2 audited members is 65.9. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **rust-genai** | Systems & Infra | Rust | C+ 66.8 | 187 |
| aisix | Systems & Infra | Rust | C+ 65 | 526 |

### c036 - 2 repositories

All 2 in Web & Interfaces.

Keeper: **atomic-mail-agentic** (B-, 70.5). Mean grade across the 2 audited members is 69.5. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **atomic-mail-agentic** | Web & Interfaces | TypeScript | B- 70.5 | 424 |
| mails | Web & Interfaces | TypeScript | C+ 68.5 | 91 |

### c039 - 2 repositories

All 2 in Web & Interfaces.

Keeper: **decimen-optical-transfer** (C+, 68.5). Mean grade across the 2 audited members is 66. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **decimen-optical-transfer** | Web & Interfaces | TypeScript | C+ 68.5 | 19 |
| qr-data-transfer | Web & Interfaces | TypeScript | C 63.6 | 44 |

### c041 - 2 repositories

All 2 in Mobile.

Keeper: **AIUsage** (C+, 68.8). Mean grade across the 2 audited members is 65.8. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **AIUsage** | Mobile | Swift | C+ 68.8 | 459 |
| quotio | Mobile | Swift | C 62.8 | 277 |

---

Generated from data/clusters.json built 2026-10-31. Regenerate with `node src/stages/build-relations.js`.
