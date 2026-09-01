# Clusters, in prose

> 61 groups covering 167 repositories. Every pair scoring at least 0.68 semantic similarity is an edge, and Louvain modularity over the thresholded semantic edges partitions that graph into groups that are linked more densely inside than out.
>
> **These groupings are INFERRED.** They come from cosine distance between neural embeddings, not from anything measured in a tree. Density is a stronger claim than the connected components this used previously - a bridge repository no longer welds two unrelated neighbourhoods together - but a group of 15 still means 15 closely related projects, not 15 copies of one. Read a large group as a thread to pull, never as a list of duplicates to delete.

## What the numbers say

- 22 of the 61 groups cross a domain boundary. Those are the ones worth reading first: two repositories the classifier put in different parts of the estate that the embedding still pulled together.
- All 167 clustered repositories have been audited, so every keeper below was chosen against a grade rather than against a gap.
- No group is entirely unaudited, so there is no group whose keeper is a guess about a guess.

## How to use this

Each group names a keeper: the highest-graded member, breaking ties on stars and then on size. The rest are candidates for review, not for deletion - the grouping is a guess and the grade behind the keeper may be missing. The machine-readable form is /data/clusters.json. A single repository neighbourhood, including the EXTRACTED shared-dependency edges this report does not cover, is at /data/kin/<id>.json.

## Groups that cross a domain

### c001 - 15 repositories

Crosses a domain boundary: 7 Agent Skills & Plugins, 5 Web & Interfaces, 3 AI & Data. That is the interesting case - the same shape of problem solved in two different parts of the estate.

Keeper: **openskills** (B+, 82.5). Mean grade across the 15 audited members is 70.4. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **openskills** | Web & Interfaces | TypeScript | B+ 82.5 | 94 |
| Grafanaskills | Agent Skills & Plugins | Shell | B 78.8 | 95 |
| skillsz | Agent Skills & Plugins | Shell | B 76.9 | 51 |
| lich-skills | Agent Skills & Plugins | Shell | B 75.6 | 46 |
| text-to-cad | Agent Skills & Plugins | JavaScript | B 75.5 | 1663 |
| mercury-agent-skills | Web & Interfaces | JavaScript | B 75.3 | 151 |
| asm | Web & Interfaces | TypeScript | B 75.2 | 402 |
| skills | Web & Interfaces | TypeScript | B- 72.1 | 67 |
| agentskills | Web & Interfaces | JavaScript | B- 71.4 | 187 |
| best-practices | Agent Skills & Plugins |  | B- 71.1 | 23 |
| ai-design-skills | Agent Skills & Plugins |  | B- 71.1 | 4 |
| agent-skills | Agent Skills & Plugins | Shell | C+ 68.7 | 56 |
| dbt-agent-skills | AI & Data | Python | C+ 68.2 | 123 |
| SkillNet | AI & Data | Python | C- 54.9 | 380 |
| OpenSpace | AI & Data | Python | F 38.4 | 1310 |

### c002 - 15 repositories

Crosses a domain boundary: 12 Web & Interfaces, 2 AI & Data, 1 Systems & Infra. That is the interesting case - the same shape of problem solved in two different parts of the estate.

Keeper: **openwiki** (B+, 82.7). Mean grade across the 15 audited members is 63.1. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **openwiki** | Web & Interfaces | TypeScript | B+ 82.7 | 218 |
| looperators | Web & Interfaces | TypeScript | B 78.2 | 294 |
| magnitude | Web & Interfaces | TypeScript | C+ 67.9 | 1862 |
| zero-agent | Systems & Infra | Go | C+ 67.2 | 1438 |
| t1code | Web & Interfaces | TypeScript | C 64.9 | 600 |
| vscode | Web & Interfaces | TypeScript | C 63.5 | 9809 |
| sandbox-agent | Web & Interfaces | TypeScript | C 63.4 | 785 |
| sharedcontext | Web & Interfaces | TypeScript | C 62.7 | 42 |
| terminal-code | Web & Interfaces | TypeScript | C 61.1 | 134 |
| sie | AI & Data | Python | C- 59.5 | 1847 |
| OpenContext | Web & Interfaces | JavaScript | C- 56.4 | 242 |
| whoami | Web & Interfaces | TypeScript | C- 56.2 | 316 |
| anywhere-agents | AI & Data | Python | C- 55.8 | 291 |
| opencode | Web & Interfaces | TypeScript | C- 53.5 | 2755 |
| Maestro | Web & Interfaces | TypeScript | C- 53.3 | 1456 |

### c003 - 6 repositories

Crosses a domain boundary: 3 Agent Skills & Plugins, 2 Web & Interfaces, 1 Systems & Infra. That is the interesting case - the same shape of problem solved in two different parts of the estate.

Keeper: **ai-job-search** (B+, 82.3). Mean grade across the 6 audited members is 67. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **ai-job-search** | Agent Skills & Plugins | TypeScript | B+ 82.3 | 212 |
| marketplace | Agent Skills & Plugins | Shell | B 78.4 | 351 |
| everything-claude-code | Agent Skills & Plugins | JavaScript | B- 74.8 | 795 |
| claude-code-router | Web & Interfaces | TypeScript | C- 56.3 | 352 |
| agentic-flow | Web & Interfaces | TypeScript | C- 56.2 | 4455 |
| career-ops | Systems & Infra | Go | C- 54.2 | 99 |

### c004 - 5 repositories

Crosses a domain boundary: 4 Agent Skills & Plugins, 1 Knowledge & Content. That is the interesting case - the same shape of problem solved in two different parts of the estate.

Keeper: **AI-research-SKILLs** (B, 77.3). Mean grade across the 5 audited members is 73.5. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **AI-research-SKILLs** | Agent Skills & Plugins | Python | B 77.3 | 306 |
| ClaudeSkills | Agent Skills & Plugins | Python | B 76.5 | 197 |
| startup-skill | Agent Skills & Plugins |  | B- 74.5 | 57 |
| awesome-agent-skills | Knowledge & Content |  | B- 72 | 4 |
| threejs-skills | Agent Skills & Plugins |  | C+ 67.1 | 11 |

### c005 - 5 repositories

Crosses a domain boundary: 3 AI & Data, 2 Web & Interfaces. That is the interesting case - the same shape of problem solved in two different parts of the estate.

Keeper: **MegaMemory** (B, 79.4). Mean grade across the 5 audited members is 64.1. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **MegaMemory** | Web & Interfaces | TypeScript | B 79.4 | 44 |
| agentmemory | Web & Interfaces | TypeScript | B 75.3 | 208 |
| memsearch | AI & Data | Python | C+ 65.3 | 201 |
| mcp-memory-service | AI & Data | Python | C- 58.2 | 1147 |
| memora | AI & Data | Python | D 42.1 | 50 |

### c009 - 3 repositories

Crosses a domain boundary: 2 Web & Interfaces, 1 AI & Data. That is the interesting case - the same shape of problem solved in two different parts of the estate.

Keeper: **local-voice-ai** (B-, 70.7). Mean grade across the 3 audited members is 58.5. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **local-voice-ai** | Web & Interfaces | TSX | B- 70.7 | 100 |
| speech-to-speech | AI & Data | Python | C- 55.1 | 70 |
| VoiceAI | Web & Interfaces | TSX | D 49.8 | 358 |

### c010 - 3 repositories

Crosses a domain boundary: 1 AI & Data, 1 Knowledge & Content, 1 Systems & Infra. That is the interesting case - the same shape of problem solved in two different parts of the estate.

Keeper: **Lead-Generation** (C, 61). Mean grade across the 3 audited members is 58.6. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **Lead-Generation** | AI & Data | Python | C 61 | 56 |
| googlemaps-scraper | Knowledge & Content |  | C- 58.7 | 93 |
| google-maps-scraper | Systems & Infra | Go | C- 56.1 | 90 |

### c012 - 3 repositories

Crosses a domain boundary: 2 Systems & Infra, 1 AI & Data. That is the interesting case - the same shape of problem solved in two different parts of the estate.

Keeper: **iwe** (C+, 69.3). Mean grade across the 3 audited members is 62.6. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **iwe** | Systems & Infra | Rust | C+ 69.3 | 248 |
| MemMachine | AI & Data | Python | C 62.5 | 706 |
| shodh-memory | Systems & Infra | Rust | C- 55.9 | 305 |

### c013 - 3 repositories

Crosses a domain boundary: 2 Systems & Infra, 1 Web & Interfaces. That is the interesting case - the same shape of problem solved in two different parts of the estate.

Keeper: **postgres** (C+, 65.4). Mean grade across the 3 audited members is 58.3. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **postgres** | Systems & Infra | C | C+ 65.4 | 7656 |
| git | Systems & Infra | Shell | C- 59.5 | 4739 |
| node | Web & Interfaces | JavaScript | C- 50 | 48185 |

### c020 - 2 repositories

Crosses a domain boundary: 1 AI & Data, 1 Systems & Infra. That is the interesting case - the same shape of problem solved in two different parts of the estate.

Keeper: **CodeGraphContext** (C-, 56.7). Mean grade across the 2 audited members is 53.8. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **CodeGraphContext** | AI & Data | Python | C- 56.7 | 981 |
| codegraph-rust | Systems & Infra | Rust | C- 50.9 | 369 |

### c023 - 2 repositories

Crosses a domain boundary: 1 AI & Data, 1 Web & Interfaces. That is the interesting case - the same shape of problem solved in two different parts of the estate.

Keeper: **Website-downloader** (B-, 71.4). Mean grade across the 2 audited members is 64.6. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **Website-downloader** | Web & Interfaces | JavaScript | B- 71.4 | 22 |
| pagesource | AI & Data | Python | C- 57.8 | 15 |

### c026 - 2 repositories

Crosses a domain boundary: 1 Agent Skills & Plugins, 1 Web & Interfaces. That is the interesting case - the same shape of problem solved in two different parts of the estate.

Keeper: **macrodata** (C+, 65.4). Mean grade across the 2 audited members is 63.8. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **macrodata** | Agent Skills & Plugins | TypeScript | C+ 65.4 | 51 |
| claude-supermemory | Web & Interfaces | JavaScript | C 62.2 | 39 |

### c031 - 2 repositories

Crosses a domain boundary: 1 AI & Data, 1 Mobile. That is the interesting case - the same shape of problem solved in two different parts of the estate.

Keeper: **mlx-audio** (B-, 70.2). Mean grade across the 2 audited members is 69.2. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **mlx-audio** | AI & Data | Python | B- 70.2 | 574 |
| mlx-audio-swift | Mobile | Swift | C+ 68.2 | 97 |

### c035 - 2 repositories

Crosses a domain boundary: 1 Systems & Infra, 1 Web & Interfaces. That is the interesting case - the same shape of problem solved in two different parts of the estate.

Keeper: **wormhole** (C, 62). Mean grade across the 2 audited members is 56.4. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **wormhole** | Systems & Infra | Go | C 62 | 47 |
| pgrok | Web & Interfaces | TypeScript | C- 50.8 | 26 |

### c039 - 2 repositories

Crosses a domain boundary: 1 Mobile, 1 Systems & Infra. That is the interesting case - the same shape of problem solved in two different parts of the estate.

Keeper: **android-sms-gateway** (C-, 58.7). Mean grade across the 2 audited members is 51.4. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **android-sms-gateway** | Mobile | Kotlin | C- 58.7 | 335 |
| httpsms | Systems & Infra | Go | D 44 | 430 |

### c044 - 2 repositories

Crosses a domain boundary: 1 Systems & Infra, 1 Web & Interfaces. That is the interesting case - the same shape of problem solved in two different parts of the estate.

Keeper: **terminal-browser** (C-, 50.8). Mean grade across the 2 audited members is 50.5. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **terminal-browser** | Web & Interfaces | TypeScript | C- 50.8 | 219 |
| carbonyl | Systems & Infra | Rust | C- 50.1 | 105 |

### c046 - 2 repositories

Crosses a domain boundary: 1 Systems & Infra, 1 Web & Interfaces. That is the interesting case - the same shape of problem solved in two different parts of the estate.

Keeper: **floci-ui** (B-, 70.2). Mean grade across the 2 audited members is 63.9. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **floci-ui** | Web & Interfaces | TypeScript | B- 70.2 | 197 |
| floci | Systems & Infra | Java | C- 57.5 | 782 |

### c050 - 2 repositories

Crosses a domain boundary: 1 AI & Data, 1 Systems & Infra. That is the interesting case - the same shape of problem solved in two different parts of the estate.

Keeper: **OpenSandbox** (B-, 71.6). Mean grade across the 2 audited members is 66.2. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **OpenSandbox** | AI & Data | Python | B- 71.6 | 2144 |
| CubeSandbox | Systems & Infra | Go | C 60.7 | 1702 |

### c051 - 2 repositories

Crosses a domain boundary: 1 Mobile, 1 Systems & Infra. That is the interesting case - the same shape of problem solved in two different parts of the estate.

Keeper: **ghostapp** (C-, 56.7). Mean grade across the 2 audited members is 53. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **ghostapp** | Systems & Infra | Rust | C- 56.7 | 249 |
| ghost-os | Mobile | Swift | D 49.4 | 51 |

### c055 - 2 repositories

Crosses a domain boundary: 1 Agent Skills & Plugins, 1 Web & Interfaces. That is the interesting case - the same shape of problem solved in two different parts of the estate.

Keeper: **loop-engineering** (B, 79.6). Mean grade across the 2 audited members is 74.3. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **loop-engineering** | Agent Skills & Plugins | TypeScript | B 79.6 | 388 |
| loopy | Web & Interfaces | JavaScript | C+ 69.1 | 53 |

### c057 - 2 repositories

Crosses a domain boundary: 1 AI & Data, 1 Systems & Infra. That is the interesting case - the same shape of problem solved in two different parts of the estate.

Keeper: **flashvad** (B+, 80.7). Mean grade across the 2 audited members is 67. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **flashvad** | AI & Data | Python | B+ 80.7 | 166 |
| ten-vad | Systems & Infra | C/C++ Header | C- 53.2 | 147 |

### c058 - 2 repositories

Crosses a domain boundary: 1 AI & Data, 1 Web & Interfaces. That is the interesting case - the same shape of problem solved in two different parts of the estate.

Keeper: **strix** (B-, 72.6). Mean grade across the 2 audited members is 70.1. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **strix** | AI & Data | Python | B- 72.6 | 333 |
| open-kritt | Web & Interfaces | JavaScript | C+ 67.6 | 392 |

## Groups inside a single domain

### c006 - 4 repositories

All 4 in AI & Data.

Keeper: **Hyper-Extract** (B-, 72.9). Mean grade across the 4 audited members is 61.4. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **Hyper-Extract** | AI & Data | Python | B- 72.9 | 449 |
| graph_maker | AI & Data | Jupyter Notebook | C 63.1 | 16 |
| knowledge_graph | AI & Data | Jupyter Notebook | C- 55.9 | 42 |
| langextract | AI & Data | Python | C- 53.7 | 129 |

### c007 - 3 repositories

All 3 in Web & Interfaces.

Keeper: **Manta** (B+, 82.2). Mean grade across the 3 audited members is 65.6. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **Manta** | Web & Interfaces | JSX | B+ 82.2 | 374 |
| invoice-builder | Web & Interfaces | TypeScript | C 64.1 | 509 |
| invoicerr | Web & Interfaces | TypeScript | C- 50.6 | 335 |

### c008 - 3 repositories

All 3 in Knowledge & Content.

Keeper: **llm-engineer-toolkit** (C-, 56). Mean grade across the 3 audited members is 55.4. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **llm-engineer-toolkit** | Knowledge & Content |  | C- 56 | 5 |
| llm-internals | Knowledge & Content |  | C- 55.7 | 4 |
| awesome-agent-learning | Knowledge & Content |  | C- 54.4 | 4 |

### c011 - 3 repositories

All 3 in Web & Interfaces.

Keeper: **codex-security** (B, 75.3). Mean grade across the 3 audited members is 69.5. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **codex-security** | Web & Interfaces | TypeScript | B 75.3 | 173 |
| oh-my-codex | Web & Interfaces | TypeScript | B- 72.7 | 410 |
| oh-my-openagent | Web & Interfaces | TypeScript | C 60.6 | 6746 |

### c014 - 2 repositories

All 2 in AI & Data.

Keeper: **Object-Detection-using-Yolov7** (C-, 55.8). Mean grade across the 2 audited members is 55.8. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **Object-Detection-using-Yolov7** | AI & Data | Jupyter Notebook | C- 55.8 | 2 |
| Object-Detection-in-YOLOv8 | AI & Data | Jupyter Notebook | C- 55.8 | 2 |

### c015 - 2 repositories

All 2 in AI & Data.

Keeper: **YOLOv8_Segmentation_DeepSORT_TRACKING_SpeedEstimation** (C-, 51.8). Mean grade across the 2 audited members is 49.6. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **YOLOv8_Segmentation_DeepSORT_TRACKING_SpeedEstimation** | AI & Data | Jupyter Notebook | C- 51.8 | 2 |
| ObjectCountingYOLOv8DeepSORT | AI & Data | Jupyter Notebook | D 47.4 | 2 |

### c016 - 2 repositories

All 2 in AI & Data.

Keeper: **daily_stock_analysis** (C-, 58.4). Mean grade across the 2 audited members is 58.2. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **daily_stock_analysis** | AI & Data | Python | C- 58.4 | 925 |
| retail-analytics | AI & Data | Python | C- 58 | 118 |

### c017 - 2 repositories

All 2 in Web & Interfaces.

Keeper: **AionUi** (C-, 51.9). Mean grade across the 2 audited members is 47.3. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **AionUi** | Web & Interfaces | TypeScript | C- 51.9 | 723 |
| Claude-Cowork | Web & Interfaces | TypeScript | D 42.7 | 44 |

### c018 - 2 repositories

All 2 in Web & Interfaces.

Keeper: **maplibre-gl-usgs-lidar** (C+, 66.8). Mean grade across the 2 audited members is 65.9. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **maplibre-gl-usgs-lidar** | Web & Interfaces | TypeScript | C+ 66.8 | 44 |
| maplibre-gl-lidar | Web & Interfaces | TypeScript | C+ 65.1 | 69 |

### c019 - 2 repositories

All 2 in Web & Interfaces.

Keeper: **agent-browser** (C, 64.2). Mean grade across the 2 audited members is 59. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **agent-browser** | Web & Interfaces | TSX | C 64.2 | 62 |
| browser-operator-core | Web & Interfaces | JavaScript | C- 53.8 | 33770 |

### c021 - 2 repositories

All 2 in Knowledge & Content.

Keeper: **iot-projects** (C, 62.9). Mean grade across the 2 audited members is 61. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **iot-projects** | Knowledge & Content |  | C 62.9 | 5 |
| awesome-electronics | Knowledge & Content |  | C- 59.1 | 7 |

### c022 - 2 repositories

All 2 in Web & Interfaces.

Keeper: **BeautySmart** (C+, 66.8). Mean grade across the 2 audited members is 55.3. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **BeautySmart** | Web & Interfaces | PHP | C+ 66.8 | 6221 |
| CRM-laravel | Web & Interfaces | PHP | D 43.9 | 320 |

### c024 - 2 repositories

All 2 in AI & Data.

Keeper: **AgenticTrading** (C, 61.4). Mean grade across the 2 audited members is 57.5. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **AgenticTrading** | AI & Data | Python | C 61.4 | 539 |
| TradingAgents | AI & Data | Python | C- 53.5 | 73 |

### c025 - 2 repositories

All 2 in Knowledge & Content.

Keeper: **claude-code-system-prompts** (C+, 66). Mean grade across the 2 audited members is 61.7. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **claude-code-system-prompts** | Knowledge & Content |  | C+ 66 | 31 |
| system-prompts-and-models-of-ai-tools | Knowledge & Content |  | C- 57.4 | 106 |

### c027 - 2 repositories

All 2 in Web & Interfaces.

Keeper: **tsl-node-editor** (C, 63.9). Mean grade across the 2 audited members is 57.3. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **tsl-node-editor** | Web & Interfaces | TypeScript | C 63.9 | 23 |
| editor | Web & Interfaces | TSX | C- 50.8 | 664 |

### c028 - 2 repositories

All 2 in Web & Interfaces.

Keeper: **codexia** (C+, 68.6). Mean grade across the 2 audited members is 58.8. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **codexia** | Web & Interfaces | TypeScript | C+ 68.6 | 1025 |
| opcode | Web & Interfaces | TSX | D 49 | 234 |

### c029 - 2 repositories

All 2 in AI & Data.

Keeper: **awesome-ai-apps** (D, 48). Mean grade across the 2 audited members is 47.9. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **awesome-ai-apps** | AI & Data | Python | D 48 | 666 |
| awesome-llm-apps | AI & Data | Python | D 47.8 | 1073 |

### c030 - 2 repositories

All 2 in Mobile.

Keeper: **FluidVoice** (C, 62.1). Mean grade across the 2 audited members is 59. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **FluidVoice** | Mobile | Swift | C 62.1 | 186 |
| VoiceInk | Mobile | Swift | C- 56 | 231 |

### c032 - 2 repositories

All 2 in AI & Data.

Keeper: **finnhub-python** (B-, 72.8). Mean grade across the 2 audited members is 67.5. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **finnhub-python** | AI & Data | Python | B- 72.8 | 19 |
| twelvedata-python | AI & Data | Python | C 62.1 | 40 |

### c033 - 2 repositories

All 2 in Web & Interfaces.

Keeper: **pluely** (C-, 59.7). Mean grade across the 2 audited members is 50. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **pluely** | Web & Interfaces | TSX | C- 59.7 | 224 |
| natively-cluely-ai-assistant | Web & Interfaces | TypeScript | D 40.2 | 182 |

### c034 - 2 repositories

All 2 in AI & Data.

Keeper: **MemOS** (B, 75.3). Mean grade across the 2 audited members is 57.5. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **MemOS** | AI & Data | Python | B 75.3 | 862 |
| MemoryOS | AI & Data | Python | F 39.8 | 73 |

### c036 - 2 repositories

All 2 in AI & Data.

Keeper: **OpenLLM** (B-, 74.3). Mean grade across the 2 audited members is 65.7. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **OpenLLM** | AI & Data | Python | B- 74.3 | 40 |
| litellm | AI & Data | Python | C- 57.1 | 7169 |

### c037 - 2 repositories

All 2 in Web & Interfaces.

Keeper: **agent-orchestrator** (B, 78.4). Mean grade across the 2 audited members is 70.3. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **agent-orchestrator** | Web & Interfaces | TypeScript | B 78.4 | 315 |
| dmux | Web & Interfaces | TypeScript | C 62.3 | 794 |

### c038 - 2 repositories

All 2 in Systems & Infra.

Keeper: **bare-lm** (C+, 69.7). Mean grade across the 2 audited members is 66.8. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **bare-lm** | Systems & Infra | C | C+ 69.7 | 13 |
| tensor.h | Systems & Infra | C | C 64 | 9 |

### c040 - 2 repositories

All 2 in Web & Interfaces.

Keeper: **node-banana** (C+, 68.4). Mean grade across the 2 audited members is 60. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **node-banana** | Web & Interfaces | TypeScript | C+ 68.4 | 395 |
| tersa | Web & Interfaces | TSX | C- 51.5 | 103 |

### c041 - 2 repositories

All 2 in AI & Data.

Keeper: **shotgun** (C, 64.3). Mean grade across the 2 audited members is 63.2. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **shotgun** | AI & Data | Python | C 64.3 | 616 |
| spec-kit | AI & Data | Python | C 62.1 | 482 |

### c042 - 2 repositories

All 2 in AI & Data.

Keeper: **hermes-webui** (C, 60.9). Mean grade across the 2 audited members is 59.1. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **hermes-webui** | AI & Data | Python | C 60.9 | 232 |
| hermes-agent | AI & Data | Python | C- 57.3 | 894 |

### c043 - 2 repositories

All 2 in Web & Interfaces.

Keeper: **easy-agent** (C, 62.9). Mean grade across the 2 audited members is 60.4. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **easy-agent** | Web & Interfaces | TypeScript | C 62.9 | 356 |
| claude-code-remote | Web & Interfaces | TypeScript | C- 57.9 | 34 |

### c045 - 2 repositories

All 2 in AI & Data.

Keeper: **freqtrade** (C-, 55.2). Mean grade across the 2 audited members is 53.8. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **freqtrade** | AI & Data | Python | C- 55.2 | 772 |
| hummingbot | AI & Data | Python | C- 52.3 | 1696 |

### c047 - 2 repositories

All 2 in Web & Interfaces.

Keeper: **homepage** (B-, 73). Mean grade across the 2 audited members is 64.2. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **homepage** | Web & Interfaces | JavaScript | B- 73 | 1416 |
| homepage-lite | Web & Interfaces | CSS | C- 55.3 | 36 |

### c048 - 2 repositories

All 2 in Web & Interfaces.

Keeper: **manaflow** (C+, 69.3). Mean grade across the 2 audited members is 63.1. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **manaflow** | Web & Interfaces | TypeScript | C+ 69.3 | 1730 |
| parallel-code | Web & Interfaces | TypeScript | C- 56.9 | 254 |

### c049 - 2 repositories

All 2 in Web & Interfaces.

Keeper: **splat-transform** (C, 60.8). Mean grade across the 2 audited members is 58.3. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **splat-transform** | Web & Interfaces | TypeScript | C 60.8 | 149 |
| supersplat | Web & Interfaces | TypeScript | C- 55.8 | 221 |

### c052 - 2 repositories

All 2 in AI & Data.

Keeper: **DeepTutor** (C-, 59). Mean grade across the 2 audited members is 50.1. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **DeepTutor** | AI & Data | Python | C- 59 | 1012 |
| VideoAgent | AI & Data | Python | D 41.3 | 853 |

### c053 - 2 repositories

All 2 in Web & Interfaces.

Keeper: **atomic-mail-agentic** (B-, 71). Mean grade across the 2 audited members is 70. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **atomic-mail-agentic** | Web & Interfaces | TypeScript | B- 71 | 424 |
| mails | Web & Interfaces | TypeScript | C+ 69 | 91 |

### c054 - 2 repositories

All 2 in AI & Data.

Keeper: **ai-agents-for-beginners** (C, 63.7). Mean grade across the 2 audited members is 60.3. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **ai-agents-for-beginners** | AI & Data | Jupyter Notebook | C 63.7 | 9284 |
| build-your-own-openclaw | AI & Data | Python | C- 56.9 | 844 |

### c056 - 2 repositories

All 2 in AI & Data.

Keeper: **kimi-k3-in-c** (C+, 69.3). Mean grade across the 2 audited members is 62.8. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **kimi-k3-in-c** | AI & Data | Python | C+ 69.3 | 282 |
| smol-kimi-k3 | AI & Data | Python | C- 56.3 | 22 |

### c059 - 2 repositories

All 2 in Web & Interfaces.

Keeper: **computer** (B-, 74.2). Mean grade across the 2 audited members is 73.6. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **computer** | Web & Interfaces | TypeScript | B- 74.2 | 552 |
| cloudflare-os | Web & Interfaces | TypeScript | B- 72.9 | 813 |

### c060 - 2 repositories

All 2 in Systems & Infra.

Keeper: **cas** (C+, 66.7). Mean grade across the 2 audited members is 60.8. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **cas** | Systems & Infra | Rust | C+ 66.7 | 2569 |
| claude_code_agent_farm | Systems & Infra | Shell | C- 54.8 | 160 |

### c061 - 2 repositories

All 2 in Knowledge & Content.

Keeper: **awesome-agents** (C+, 68.1). Mean grade across the 2 audited members is 62. Every member is audited, so the choice of keeper rests on evidence.

| repository | domain | language | grade | files |
| --- | --- | --- | --- | --- |
| **awesome-agents** | Knowledge & Content |  | C+ 68.1 | 2 |
| free-ai-agents-resources | Knowledge & Content |  | C- 56 | 4 |

---

Generated from data/clusters.json built 2026-09-01. Regenerate with `node src/stages/build-relations.js`.
