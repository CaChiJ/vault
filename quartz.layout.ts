import { PageLayout, SharedLayout } from "./quartz/cfg"
import * as Component from "./quartz/components"

// components shared across all pages
export const sharedPageComponents: SharedLayout = {
  head: Component.Head(),
  header: [],
  afterBody: [
    Component.ConditionalRender({
      component: Component.RecentNotes({
        title: " ",
        limit: 999,
        showTags: true,
        filter: (f) => f.slug !== "index" && f.slug !== "posts",
      }),
      condition: (page) => page.fileData.slug === "posts",
    }),
    Component.ConditionalRender({
      component: Component.RecentNotes({
        title: "Recent Posts",
        limit: 5,
        showTags: false,
        linkToMore: "posts" as any,
        filter: (f) => f.slug !== "index" && f.slug !== "posts",
      }),
      condition: (page) => page.fileData.slug === "index",
    }),
    Component.ConditionalRender({
      component: Component.MobileOnly(
        Component.RecentNotes({
          limit: 5,
          showTags: false,
          linkToMore: "posts" as any,
          filter: (f) => f.slug !== "index" && f.slug !== "posts",
        }),
      ),
      condition: (page) => page.fileData.slug !== "posts" && page.fileData.slug !== "index",
    }),
    Component.ConditionalRender({
      component: Component.SiblingNotes(),
      condition: (page) =>
        page.fileData.slug !== "index" && page.fileData.slug !== "posts",
    }),
  ],
  footer: Component.Footer({
    links: {
      GitHub: "https://github.com/CaChiJ",
      LinkedIn: "https://www.linkedin.com/in/choihyunjun/",
      Email: "mailto:chj7239@gmail.com",
    },
  }),
}

// components for pages that display a single page (e.g. a single note)
export const defaultContentPageLayout: PageLayout = {
  beforeBody: [
    Component.ConditionalRender({
      component: Component.Breadcrumbs(),
      condition: (page) => page.fileData.slug !== "index",
    }),
    Component.ArticleTitle(),
    Component.ConditionalRender({
      component: Component.ContentMeta(),
      condition: (page) => page.fileData.slug !== "index",
    }),
    Component.TagList(),
  ],
  left: [
    Component.PageTitle(),
    Component.MobileOnly(Component.Spacer()),
    Component.Flex({
      components: [
        {
          Component: Component.Search(),
          grow: true,
        },
        { Component: Component.Darkmode() },
        { Component: Component.ReaderMode() },
      ],
    }),
    Component.Explorer({
      filterFn: (node) => node.slugSegment !== "tags" && node.slugSegment !== "posts",
    }),
    Component.ConditionalRender({
      component: Component.DesktopOnly(
        Component.RecentNotes({
          title: "Recent Posts",
          limit: 2,
          showTags: false,
          linkToMore: "posts" as any,
          filter: (f) => f.slug !== "index" && f.slug !== "posts",
        }),
      ),
      condition: (page) => page.fileData.slug !== "index",
    }),
  ],
  right: [
    Component.Graph(),
    Component.DesktopOnly(Component.TableOfContents()),
    Component.Backlinks(),
  ],
}

// components for pages that display lists of pages  (e.g. tags or folders)
export const defaultListPageLayout: PageLayout = {
  beforeBody: [Component.Breadcrumbs(), Component.ArticleTitle(), Component.ContentMeta()],
  left: [
    Component.PageTitle(),
    Component.MobileOnly(Component.Spacer()),
    Component.Flex({
      components: [
        {
          Component: Component.Search(),
          grow: true,
        },
        { Component: Component.Darkmode() },
      ],
    }),
    Component.Explorer({
      filterFn: (node) => node.slugSegment !== "tags" && node.slugSegment !== "posts",
    }),
    Component.DesktopOnly(
      Component.RecentNotes({
        title: "Recent Posts",
        limit: 2,
        showTags: false,
        linkToMore: "posts" as any,
        filter: (f) => f.slug !== "index" && f.slug !== "posts",
      }),
    ),
  ],
  right: [],
}
