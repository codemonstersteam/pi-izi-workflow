// MODULE_CONTRACT: paths — где у шага 9C что лежит. io: none.
// Invariants: пути относительные. Порция адресуется ИДЕНТИФИКАТОРОМ use case, а не номером: на этом
//             держится список порций в состоянии и адресность наряда починки.
// Interface: FRD, TREE, VALUES, WORK, OUT, STAGED, skeletonAt, seedAt, portionAt
export const FRD = ".agent/frd.xml"
export const TREE = ".agent/tree.xml"
export const VALUES = ".agent/values.xml"
export const WORK = ".agent/step9"
export const OUT = ".agent/flows.xml"
export const STAGED = ".agent/staging/flows.xml"
export const skeletonAt = () => `${WORK}/flows-skeleton.xml`
export const seedAt = (uc) => `${WORK}/flows~${uc}.xml`
export const portionAt = (uc) => `.agent/staging/flows~${uc}.xml`
