export type NoteFormat = 'txt' | 'pdf' | 'md'

export type NoteSourceKind = 'file' | 'book_directory' | 'library_directory'

export type NoteChapter = {
  chapterId: string
  titleZh: string
  titleEn: string
  sourceFile: string
  lineRange: string
  roleRefs: string[]
  eventRefs: string[]
  factionRefs: string[]
  placeRefs: string[]
  tags: string[]
}

export type NoteRole = {
  nodeId: string
  canonicalNameEn: string
  canonicalNameZh: string
  aliasTokensEn: string[]
  aliasTokensZh: string[]
  sourceFiles: string[]
  chapterRefs: string[]
  mentionRanges: string[]
  relationRefs: string[]
  eventRefs: string[]
  abilityRefs: string[]
  factionRefs: string[]
  placeRefs: string[]
  tags: string[]
}

export type NoteRelation = {
  nodeId: string
  leftRef: string
  rightRef: string
  leftZh: string
  rightZh: string
  relationTypes: string[]
  chapterRefs: string[]
  evidenceRanges: string[]
  eventRefs: string[]
  tags: string[]
}

export type NoteEvent = {
  nodeId: string
  labelZh: string
  chapterRef: string
  sourceFiles: string[]
  lineRanges: string[]
  participantRefs: string[]
  placeRefs: string[]
  relationRefs: string[]
  precedingEventRefs: string[]
  followingEventRefs: string[]
  tags: string[]
}

export type NotePlace = {
  nodeId: string
  canonicalNameEn: string
  canonicalNameZh: string
  aliasTokensEn: string[]
  aliasTokensZh: string[]
  sourceFiles: string[]
  chapterRefs: string[]
  mentionRanges: string[]
  eventRefs: string[]
  roleRefs: string[]
  factionRefs: string[]
  tags: string[]
}

export type NoteFaction = {
  nodeId: string
  canonicalNameEn: string
  canonicalNameZh: string
  aliasTokensEn: string[]
  aliasTokensZh: string[]
  sourceFiles: string[]
  chapterRefs: string[]
  mentionRanges: string[]
  roleRefs: string[]
  eventRefs: string[]
  placeRefs: string[]
  tags: string[]
}

export type NoteAbility = {
  nodeId: string
  canonicalNameEn: string
  canonicalNameZh: string
  aliasTokensEn: string[]
  aliasTokensZh: string[]
  ownerRefs: string[]
  sourceFiles: string[]
  chapterRefs: string[]
  mentionRanges: string[]
  eventRefs: string[]
  tags: string[]
}

export type NoteTimeline = {
  nodeId: string
  labelEn: string
  labelZh: string
  eventRefs: string[]
  chapterRefs: string[]
  tags: string[]
}

export type NoteBook = {
  bookId: string
  bookNameZh: string
  bookNameEn: string
  format: NoteFormat
  sourceKind: NoteSourceKind
  sourceRoot: string
  sourceFiles: string[]
  chapters: NoteChapter[]
  roles: NoteRole[]
  relations: NoteRelation[]
  events: NoteEvent[]
  places: NotePlace[]
  factions: NoteFaction[]
  abilities: NoteAbility[]
  timelines: NoteTimeline[]
}
