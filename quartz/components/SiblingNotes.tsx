import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { resolveRelative } from "../util/path"
import { byDateAndAlphabetical } from "./PageList"
import { getDate } from "./Date"
import { classNames } from "../util/lang"

export default (() => {
  const SiblingNotes: QuartzComponent = ({
    allFiles,
    fileData,
    displayClass,
    cfg,
  }: QuartzComponentProps) => {
    const currentSlug = fileData.slug!
    const currentFolder = currentSlug.includes("/")
      ? currentSlug.slice(0, currentSlug.lastIndexOf("/"))
      : ""

    // Sort oldest first
    const siblings = allFiles
      .filter((f) => {
        if (f.slug === currentSlug || f.slug === "index") return false
        const folder = f.slug!.includes("/")
          ? f.slug!.slice(0, f.slug!.lastIndexOf("/"))
          : ""
        return folder === currentFolder
      })
      .sort(byDateAndAlphabetical(cfg))
      .reverse()

    const currentIndex = siblings.findIndex((f) => {
      const currentDate = getDate(cfg, fileData)
      const fDate = getDate(cfg, f)
      if (!currentDate || !fDate) return false
      return fDate.getTime() === currentDate.getTime() && f.slug === currentSlug
    })

    // Find prev/next based on date order (oldest first)
    // If current page isn't in siblings (shouldn't happen), find by date comparison
    let prevIndex = -1
    let nextIndex = -1

    if (currentIndex !== -1) {
      prevIndex = currentIndex - 1
      nextIndex = currentIndex + 1
    } else {
      // Fallback: find position by date
      const currentDate = getDate(cfg, fileData)
      if (currentDate) {
        for (let i = 0; i < siblings.length; i++) {
          const d = getDate(cfg, siblings[i])
          if (d && d.getTime() >= currentDate.getTime()) {
            nextIndex = i
            prevIndex = i - 1
            break
          }
        }
        if (nextIndex === -1) {
          prevIndex = siblings.length - 1
        }
      }
    }

    const prev = prevIndex >= 0 ? siblings[prevIndex] : null
    const next = nextIndex >= 0 && nextIndex < siblings.length ? siblings[nextIndex] : null

    if (!prev && !next) return null

    return (
      <nav class={classNames(displayClass, "sibling-nav")}>
        <div class="sibling-prev">
          {prev && (
            <a href={resolveRelative(fileData.slug!, prev.slug!)} class="internal">
              <span class="sibling-label">← 이전 글</span>
              <span class="sibling-title">{prev.frontmatter?.title ?? ""}</span>
            </a>
          )}
        </div>
        <div class="sibling-next">
          {next && (
            <a href={resolveRelative(fileData.slug!, next.slug!)} class="internal">
              <span class="sibling-label">다음 글 →</span>
              <span class="sibling-title">{next.frontmatter?.title ?? ""}</span>
            </a>
          )}
        </div>
      </nav>
    )
  }

  SiblingNotes.css = `
    .sibling-nav {
      display: flex;
      justify-content: space-between;
      gap: 1.5rem;
      margin-top: 2rem;
    }

    .sibling-prev, .sibling-next {
      flex: 1;
      min-width: 0;
    }

    .sibling-next {
      text-align: right;
    }

    .sibling-nav a {
      display: flex;
      flex-direction: column;
      gap: 0.3rem;
      padding: 1rem 1.2rem;
      border: 1px solid var(--lightgray);
      border-radius: 8px;
      background-color: transparent;
      text-decoration: none;
    }

    .sibling-nav a:hover {
      background-color: var(--highlight);
    }

    .sibling-label {
      font-size: 0.85rem;
      opacity: 0.6;
    }

    .sibling-title {
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `
  return SiblingNotes
}) satisfies QuartzComponentConstructor
