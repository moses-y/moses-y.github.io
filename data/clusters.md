# Clusters, in prose

> 44 groups covering 116 repositories. Every pair scoring at least 0.68 semantic similarity is an edge, and Louvain modularity over the thresholded semantic edges partitions that graph into groups that are linked more densely inside than out.
>
> **These groupings are INFERRED.** They come from cosine distance between neural embeddings, not from anything measured in a tree. Density is a stronger claim than the connected components this used previously - a bridge repository no longer welds two unrelated neighbourhoods together - but a group of 8 still means 8 closely related projects, not 8 copies of one. Read a large group as a thread to pull, never as a list of duplicates to delete.

## What the numbers say

- 18 of the 44 groups cross a domain boundary. Those are the ones worth reading first: two repositories the classifier put in different parts of the estate that the embedding still pulled together.
- 3 of the 116 clustered repositories (3%) have never been audited. Every keeper chosen over one of them is a provisional choice.
- No group is entirely unaudited, so there is no group whose keeper is a guess about a guess.

## How to use this

Each group names a keeper: the highest-graded member, breaking ties on stars and then on size. The rest are candidates for review, not for deletion - the grouping is a guess and the grade behind the keeper may be missing. The machine-readable form is /data/clusters.json. A single repository neighbourhood, including the EXTRACTED shared-dependency edges this report does not cover, is at /data/kin/<id>.json.

## Groups that cross a domain

### c001 - 8 repositories

Crosses a domain boundary: 7 Web & Interfaces, 1 AI & Data. That is the interesting case - the same shape of problem solved in two different parts of the estate.

Keeper: **agent-orchestrator** (B, 79.7). Mean grade across the 8 audited members is 68.6. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **agent-orchestrator** | Web & Interfaces | TypeScript | B 79.7 | 315 |
| cezar | Web & Interfaces | TypeScript | B 78.8 | 1915 |
| paseo | Web & Interfaces | TypeScript | B- 73 | 1647 |
| manaflow | Web & Interfaces | TypeScript | B- 70 | 1730 |
| mco | AI & Data | Python | C+ 66.7 | 568 |
| parallel-code | Web & Interfaces | TypeScript | C 62.6 | 254 |
| orca | Web & Interfaces | TypeScript | C 61.6 | 6335 |
| Maestro | Web & Interfaces | TypeScript | C- 56.6 | 1456 |

### c002 - 6 repositories

Crosses a domain boundary: 3 Agent Skills & Plugins, 3 Web & Interfaces. That is the interesting case - the same shape of problem solved in two different parts of the estate.

Keeper: **openskills** (B+, 81.8). Mean grade across the 5 audited members is 71.8. 1 of 6 (17%) have not been audited, so a better keeper may be hiding among them.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **openskills** | Web & Interfaces | TypeScript | B+ 81.8 | 94 |
| skills | Web & Interfaces | TypeScript | B 78.5 | 67 |
| mercury-agent-skills | Web & Interfaces | JavaScript | B 75.3 | 151 |
| brooklyn-skills | Agent Skills & Plugins | JavaScript | B- 71.1 | 24 |
| agent-skills | Agent Skills & Plugins | JavaScript | C- 52.1 | 56 |
| Remotion-skills | Agent Skills & Plugins | TypeScript | not audited | 267 |

### c003 - 4 repositories

Crosses a domain boundary: 2 Systems & Infra, 1 AI & Data, 1 Web & Interfaces. That is the interesting case - the same shape of problem solved in two different parts of the estate.

Keeper: **hyprnote** (C, 64.6). Mean grade across the 4 audited members is 55.8. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **hyprnote** | Systems & Infra | Rust | C 64.6 | 3671 |
| stenoai | AI & Data | Python | C- 58.4 | 62 |
| murmure | Web & Interfaces | TypeScript | C- 53.6 | 435 |
| meetily | Systems & Infra | Rust | D 46.7 | 509 |

### c004 - 4 repositories

Crosses a domain boundary: 3 Mobile, 1 AI & Data. That is the interesting case - the same shape of problem solved in two different parts of the estate.

Keeper: **FluidVoice** (C, 62). Mean grade across the 4 audited members is 56.2. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **FluidVoice** | Mobile | Swift | C 62 | 186 |
| VoiceInk | Mobile | Swift | C- 57.4 | 231 |
| pindrop | Mobile | Swift | C- 54.5 | 569 |
| lipflow | AI & Data | Python | C- 50.8 | 87 |

### c005 - 4 repositories

Crosses a domain boundary: 2 AI & Data, 1 Knowledge & Content, 1 Systems & Infra. That is the interesting case - the same shape of problem solved in two different parts of the estate.

Keeper: **google-maps-scraper** (C, 63.2). Mean grade across the 4 audited members is 58.9. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **google-maps-scraper** | Systems & Infra | Go | C 63.2 | 90 |
| Lead-Generation | AI & Data | Python | C 61.1 | 56 |
| googlemaps-scraper | Knowledge & Content |  | C- 58.7 | 93 |
| Google-Maps-Scrapper | AI & Data | Python | C- 52.6 | 6 |

### c007 - 4 repositories

Crosses a domain boundary: 3 Web & Interfaces, 1 Agent Skills & Plugins. That is the interesting case - the same shape of problem solved in two different parts of the estate.

Keeper: **open-second-brain** (B+, 84). Mean grade across the 4 audited members is 78. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **open-second-brain** | Web & Interfaces | TypeScript | B+ 84 | 2597 |
| obsidian-mind | Agent Skills & Plugins | TypeScript | B+ 80.6 | 187 |
| MegaMemory | Web & Interfaces | TypeScript | B 78.6 | 44 |
| agentmemory | Web & Interfaces | TypeScript | C+ 68.8 | 208 |

### c013 - 3 repositories

Crosses a domain boundary: 1 AI & Data, 1 Systems & Infra, 1 Web & Interfaces. That is the interesting case - the same shape of problem solved in two different parts of the estate.

Keeper: **winpodx** (C, 62.3). Mean grade across the 3 audited members is 57.8. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **winpodx** | AI & Data | Python | C 62.3 | 502 |
| winboat | Web & Interfaces | TypeScript | C- 57.8 | 121 |
| winapps | Systems & Infra | Shell | C- 53.2 | 245 |

### c015 - 3 repositories

Crosses a domain boundary: 2 Systems & Infra, 1 AI & Data. That is the interesting case - the same shape of problem solved in two different parts of the estate.

Keeper: **free-my-tv** (C, 61.3). Mean grade across the 3 audited members is 56.7. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **free-my-tv** | Systems & Infra | Java | C 61.3 | 106 |
| unbloat-android-tv | Systems & Infra | Java | C- 54.4 | 44 |
| cleanyourtv | AI & Data | Python | C- 54.3 | 327 |

### c024 - 2 repositories

Crosses a domain boundary: 1 AI & Data, 1 Mobile. That is the interesting case - the same shape of problem solved in two different parts of the estate.

Keeper: **mlx-audio** (B-, 71.1). Mean grade across the 2 audited members is 70.7. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **mlx-audio** | AI & Data | Python | B- 71.1 | 574 |
| mlx-audio-swift | Mobile | Swift | B- 70.3 | 97 |

### c027 - 2 repositories

Crosses a domain boundary: 1 Mobile, 1 Systems & Infra. That is the interesting case - the same shape of problem solved in two different parts of the estate.

Keeper: **android-sms-gateway** (C, 60.3). Mean grade across the 2 audited members is 54.6. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **android-sms-gateway** | Mobile | Kotlin | C 60.3 | 335 |
| httpsms | Systems & Infra | Go | D 49 | 430 |

### c031 - 2 repositories

Crosses a domain boundary: 1 AI & Data, 1 Web & Interfaces. That is the interesting case - the same shape of problem solved in two different parts of the estate.

Keeper: **gpu-hot** (C, 62.9). Mean grade across the 2 audited members is 53.2. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **gpu-hot** | Web & Interfaces | JavaScript | C 62.9 | 68 |
| nvitop | AI & Data | Python | D 43.5 | 116 |

### c033 - 2 repositories

Crosses a domain boundary: 1 Agent Skills & Plugins, 1 Web & Interfaces. That is the interesting case - the same shape of problem solved in two different parts of the estate.

Keeper: **ai-job-search** (A-, 86.9). Mean grade across the 2 audited members is 71. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **ai-job-search** | Agent Skills & Plugins | Python | A- 86.9 | 212 |
| career-ops | Web & Interfaces | JavaScript | C- 55 | 99 |

### c034 - 2 repositories

Crosses a domain boundary: 1 AI & Data, 1 Web & Interfaces. That is the interesting case - the same shape of problem solved in two different parts of the estate.

Keeper: **llmwiki** (B-, 74.9). Mean grade across the 2 audited members is 69.5. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **llmwiki** | AI & Data | Python | B- 74.9 | 300 |
| llm_wiki | Web & Interfaces | TypeScript | C 64.1 | 227 |

### c035 - 2 repositories

Crosses a domain boundary: 1 Agent Skills & Plugins, 1 Web & Interfaces. That is the interesting case - the same shape of problem solved in two different parts of the estate.

Keeper: **agentskills** (B-, 71.4). Mean grade across the 2 audited members is 70.3. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **agentskills** | Web & Interfaces | JavaScript | B- 71.4 | 187 |
| lich-skills | Agent Skills & Plugins | TypeScript | C+ 69.1 | 46 |

### c040 - 2 repositories

Crosses a domain boundary: 1 AI & Data, 1 Systems & Infra. That is the interesting case - the same shape of problem solved in two different parts of the estate.

Keeper: **flashvad** (B+, 80.7). Mean grade across the 2 audited members is 71. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **flashvad** | AI & Data | Python | B+ 80.7 | 166 |
| ten-vad | Systems & Infra | C | C 61.2 | 147 |

### c042 - 2 repositories

Crosses a domain boundary: 1 Agent Skills & Plugins, 1 Web & Interfaces. That is the interesting case - the same shape of problem solved in two different parts of the estate.

Keeper: **no-ai-slop** (B-, 74.5). Mean grade across the 2 audited members is 69.8. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **no-ai-slop** | Agent Skills & Plugins | Python | B- 74.5 | 13 |
| avoid-ai-writing | Web & Interfaces | JavaScript | C+ 65.2 | 50 |

### c043 - 2 repositories

Crosses a domain boundary: 1 Mobile, 1 Systems & Infra. That is the interesting case - the same shape of problem solved in two different parts of the estate.

Keeper: **AIUsage** (C+, 66.4). Mean grade across the 2 audited members is 64.7. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **AIUsage** | Mobile | Swift | C+ 66.4 | 459 |
| quotio | Systems & Infra | Rust | C 63 | 277 |

### c044 - 2 repositories

Crosses a domain boundary: 1 Systems & Infra, 1 Web & Interfaces. That is the interesting case - the same shape of problem solved in two different parts of the estate.

Keeper: **free-for-dev** (C+, 68.1). Mean grade across the 2 audited members is 65.3. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **free-for-dev** | Web & Interfaces | HTML | C+ 68.1 | 10 |
| free-for-devs | Systems & Infra |  | C 62.6 | 3 |

## Groups inside a single domain

### c006 - 4 repositories

All 4 in AI & Data.

Keeper: **forgetful** (B-, 71.5). Mean grade across the 4 audited members is 66. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **forgetful** | AI & Data | Python | B- 71.5 | 379 |
| mcp-memory-service | AI & Data | Python | C+ 66.3 | 1147 |
| MemMachine | AI & Data | Python | C 63.7 | 706 |
| MARM-Systems | AI & Data | Python | C 62.5 | 124 |

### c008 - 3 repositories

All 3 in Web & Interfaces.

Keeper: **continue** (C+, 67.9). Mean grade across the 3 audited members is 61.9. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **continue** | Web & Interfaces | TypeScript | C+ 67.9 | 3058 |
| oh-my-openagent | Web & Interfaces | TypeScript | C 60.8 | 6746 |
| opencode | Web & Interfaces | TypeScript | C- 57 | 2755 |

### c009 - 3 repositories

All 3 in Web & Interfaces.

Keeper: **BeautySmart** (C+, 66.1). Mean grade across the 3 audited members is 53. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **BeautySmart** | Web & Interfaces | PHP | C+ 66.1 | 6221 |
| Multi-Beauty-Salon-Web-Application-In-ReactJS-Firebase | Web & Interfaces | JavaScript | D 49 | 23896 |
| Salon-Management-System | Web & Interfaces | PHP | D 43.9 | 170 |

### c010 - 3 repositories

All 3 in Web & Interfaces.

Keeper: **n8n** (B-, 70.1). Mean grade across the 3 audited members is 62.9. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **n8n** | Web & Interfaces | TypeScript | B- 70.1 | 17556 |
| n8n-as-code | Web & Interfaces | TypeScript | C- 59.6 | 357 |
| VibeWorkflowPlatform | Web & Interfaces | TypeScript | C- 59 | 2203 |

### c011 - 3 repositories

All 3 in AI & Data.

Keeper: **FinRL** (C+, 65). Mean grade across the 3 audited members is 52.7. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **FinRL** | AI & Data | Jupyter Notebook | C+ 65 | 195 |
| tensortrade | AI & Data | Python | C- 53.2 | 153 |
| TradeMaster | AI & Data | Python | F 39.9 | 776 |

### c012 - 3 repositories

All 3 in Web & Interfaces.

Keeper: **OpenHands** (B-, 71.6). Mean grade across the 3 audited members is 57.8. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **OpenHands** | Web & Interfaces | TypeScript | B- 71.6 | 2658 |
| Personal_AI_Infrastructure | Web & Interfaces | TypeScript | C 60.2 | 1548 |
| learn-anything.xyz | Web & Interfaces | TypeScript | D 41.6 | 209 |

### c014 - 3 repositories

All 3 in Systems & Infra.

Keeper: **CubeSandbox** (C+, 68.6). Mean grade across the 2 audited members is 68.4. 1 of 3 (33%) have not been audited, so a better keeper may be hiding among them.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **CubeSandbox** | Systems & Infra | Go | C+ 68.6 | 1702 |
| OpenSandbox | Systems & Infra | Go | C+ 68.2 | 2144 |
| substrate | Systems & Infra | Go | not audited | 14038 |

### c016 - 2 repositories

All 2 in AI & Data.

Keeper: **YOLOv8_Segmentation_DeepSORT_TRACKING_SpeedEstimation** (C-, 50.7). Mean grade across the 2 audited members is 49. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **YOLOv8_Segmentation_DeepSORT_TRACKING_SpeedEstimation** | AI & Data | Jupyter Notebook | C- 50.7 | 2 |
| ObjectCountingYOLOv8DeepSORT | AI & Data | Jupyter Notebook | D 47.4 | 2 |

### c017 - 2 repositories

All 2 in Web & Interfaces.

Keeper: **maplibre-gl-lidar** (B-, 73.2). Mean grade across the 2 audited members is 71.3. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **maplibre-gl-lidar** | Web & Interfaces | TypeScript | B- 73.2 | 69 |
| maplibre-gl-usgs-lidar | Web & Interfaces | TypeScript | C+ 69.3 | 44 |

### c018 - 2 repositories

All 2 in Web & Interfaces.

Keeper: **Manta** (B+, 81.6). Mean grade across the 2 audited members is 71.7. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **Manta** | Web & Interfaces | JSX | B+ 81.6 | 374 |
| invoice-builder | Web & Interfaces | TypeScript | C 61.7 | 509 |

### c019 - 2 repositories

All 2 in AI & Data.

Keeper: **TradingAgents** (C-, 56.6). Mean grade across the 2 audited members is 56.5. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **TradingAgents** | AI & Data | Python | C- 56.6 | 73 |
| AgenticTrading | AI & Data | Python | C- 56.3 | 539 |

### c020 - 2 repositories

All 2 in Web & Interfaces.

Keeper: **altersend** (C+, 69.9). Mean grade across the 2 audited members is 64. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **altersend** | Web & Interfaces | TypeScript | C+ 69.9 | 1029 |
| alt-sendme | Web & Interfaces | TypeScript | C- 58.1 | 116 |

### c021 - 2 repositories

All 2 in AI & Data.

Keeper: **livecc** (D, 45.8). Mean grade across the 2 audited members is 43.2. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **livecc** | AI & Data | Python | D 45.8 | 95 |
| VideoAgent | AI & Data | Python | D 40.6 | 853 |

### c022 - 2 repositories

All 2 in AI & Data.

Keeper: **graph_maker** (C, 61.9). Mean grade across the 2 audited members is 58.9. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **graph_maker** | AI & Data | Jupyter Notebook | C 61.9 | 16 |
| knowledge_graph | AI & Data | Jupyter Notebook | C- 55.9 | 42 |

### c023 - 2 repositories

All 2 in AI & Data.

Keeper: **awesome-llm-apps** (C-, 51.1). Mean grade across the 2 audited members is 49. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **awesome-llm-apps** | AI & Data | Python | C- 51.1 | 1073 |
| awesome-ai-apps | AI & Data | Python | D 46.9 | 666 |

### c025 - 2 repositories

All 2 in AI & Data.

Keeper: **client-python** (B, 78.1). Mean grade across the 2 audited members is 70.8. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **client-python** | AI & Data | Python | B 78.1 | 301 |
| twelvedata-python | AI & Data | Python | C 63.4 | 40 |

### c026 - 2 repositories

All 2 in Web & Interfaces.

Keeper: **pluely** (C-, 59.4). Mean grade across the 2 audited members is 49.4. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **pluely** | Web & Interfaces | TypeScript | C- 59.4 | 224 |
| natively-cluely-ai-assistant | Web & Interfaces | TypeScript | F 39.4 | 182 |

### c028 - 2 repositories

All 2 in Web & Interfaces.

Keeper: **FileSync** (C+, 65.3). Mean grade across the 2 audited members is 61.5. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **FileSync** | Web & Interfaces | JavaScript | C+ 65.3 | 44 |
| OpenDrop | Web & Interfaces | JavaScript | C- 57.6 | 12 |

### c029 - 2 repositories

All 2 in AI & Data.

Keeper: **public-apis** (B+, 81.4). Mean grade across the 2 audited members is 72.3. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **public-apis** | AI & Data | Python | B+ 81.4 | 22 |
| awesome-opensource-ai | AI & Data | Python | C 63.1 | 8 |

### c030 - 2 repositories

All 2 in AI & Data.

Keeper: **cadquery** (B-, 72.1). Mean grade across the 2 audited members is 71.6. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **cadquery** | AI & Data | Python | B- 72.1 | 209 |
| build123d | AI & Data | Python | B- 71.1 | 649 |

### c032 - 2 repositories

All 2 in Systems & Infra.

Keeper: **rust-genai** (C+, 68.2). Mean grade across the 2 audited members is 68.1. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **rust-genai** | Systems & Infra | Rust | C+ 68.2 | 187 |
| aisix | Systems & Infra | Rust | C+ 67.9 | 526 |

### c036 - 2 repositories

All 2 in Web & Interfaces.

Keeper: **atomic-mail-agentic** (B-, 71). Mean grade across the 2 audited members is 70.3. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **atomic-mail-agentic** | Web & Interfaces | TypeScript | B- 71 | 424 |
| mails | Web & Interfaces | TypeScript | C+ 69.6 | 91 |

### c037 - 2 repositories

All 2 in Systems & Infra.

Keeper: **monocode** (C+, 66.4). Mean grade across the 2 audited members is 64.3. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **monocode** | Systems & Infra | Rust | C+ 66.4 | 1090 |
| jcode | Systems & Infra | Rust | C 62.2 | 1352 |

### c038 - 2 repositories

All 2 in AI & Data.

Keeper: **tiny-tts** (C-, 50.7). Mean grade across the 1 audited members is 50.7. 1 of 2 (50%) have not been audited, so a better keeper may be hiding among them.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **tiny-tts** | AI & Data | Python | C- 50.7 | 57 |
| tiny-voca | AI & Data | Python | not audited | 50 |

### c039 - 2 repositories

All 2 in AI & Data.

Keeper: **VoiceStudio** (C+, 66.8). Mean grade across the 2 audited members is 63.7. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **VoiceStudio** | AI & Data | Python | C+ 66.8 | 2062 |
| voicebox | AI & Data | Python | C 60.6 | 677 |

### c041 - 2 repositories

All 2 in Web & Interfaces.

Keeper: **qr-data-transfer** (C, 63.5). Mean grade across the 2 audited members is 62.8. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **qr-data-transfer** | Web & Interfaces | TypeScript | C 63.5 | 44 |
| decimen-optical-transfer | Web & Interfaces | TypeScript | C 62 | 19 |

---

Generated from data/clusters.json built 2026-11-21. Regenerate with `node src/stages/build-relations.js`.
