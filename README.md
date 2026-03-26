# Content Distribution MCP

MCP server for multi-platform content distribution — draft, repurpose, schedule, and analyze posts for LinkedIn, Instagram, X/Twitter, TikTok from any AI agent.

## Installation

```bash
npx content-distribution-mcp
```

Or install globally:

```bash
npm install -g content-distribution-mcp
```

## Configuration

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "content-distribution": {
      "command": "npx",
      "args": ["-y", "content-distribution-mcp"],
      "env": {
        "CONTENT_DIR": "/path/to/your/content/directory"
      }
    }
  }
}
```

### Claude Code

Add to `.claude/settings.json`:

```json
{
  "mcpServers": {
    "content-distribution": {
      "command": "npx",
      "args": ["-y", "content-distribution-mcp"],
      "env": {
        "CONTENT_DIR": "/path/to/your/content/directory"
      }
    }
  }
}
```

## Tools

| Tool | Description |
|------|-------------|
| `draft_post` | Generate a post for any platform with 7 formats and 3 tones |
| `repurpose_content` | Adapt content from one platform to another |
| `generate_carousel` | Generate carousel slides for LinkedIn/Instagram |
| `schedule_content` | Schedule content to the publication queue |
| `get_content_calendar` | View the content calendar for upcoming days |
| `analyze_post_performance` | Analyze a post's estimated engagement and get improvement tips |
| `generate_thread` | Generate a multi-post thread for X or LinkedIn |

## Post Formats

- `hook_story` — Hook + personal story + lesson
- `stat_choc` — Shocking statistic + analysis
- `question` — Provocative question + discussion
- `framework` — Step-by-step framework/method
- `temoignage` — Client testimonial/case study
- `mythe_realite` — Myth vs reality debunk
- `behind_scenes` — Behind the scenes content

## Platforms

- LinkedIn (posts, carousels, threads)
- Instagram (posts, carousels, reels captions)
- X/Twitter (tweets, threads)
- TikTok (captions)

## Resources

- `content-distribution://content-queue` — Planned content queue

## Prompts

- `weekly_content_sprint` — Generate a 5-post weekly content sprint

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `CONTENT_DIR` | Path to content assets directory | `./content` |

## License

MIT
