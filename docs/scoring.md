# Scoring (100 points, fully explainable)

| Category                | Pts | Based on                                             |
| ----------------------- | --- | ---------------------------------------------------- |
| Reliability             | 20  | CR/RepairPal-style data, engine & transmission       |
| Market Value            | 20  | Listing price vs market (live comparables ≥3, else model baseline) |
| Total Ownership Cost    | 15  | Fuel, insurance, maintenance, repairs, parts         |
| Winter Capability       | 10  | AWD, ground clearance, winter reliability, traction  |
| Safety                  | 10  | IIHS/NHTSA + driver-assist features on the car       |
| Mileage                 | 10  | Actual vs expected km for its age (not just lowest)  |
| Resale Value            | 5   | Brand/model value retention                          |
| Recalls & Known Issues  | 5   | Open-recall risk, costly pattern failures            |
| CPO / Warranty          | 3   | CPO status, remaining warranty                       |
| Desirable Features      | 2   | Heated seats, remote start, CarPlay/AA, ACC, sunroof |

Every listing exposes the full breakdown (points, stars, human-readable
reason per category), market comparison (market vs asking vs savings), deal
rating, known issues, pros and cons — the UI shows *why* a car ranks first.

Two things are deliberately **not** folded into the score:

- **Recall history** comes from Transport Canada data
  (`data/recalls.generated.json`, rebuilt with `npm run recalls:build -w server`)
  and is shown as its own labelled section. A recall on record means one was
  *issued* for that make/model/year — only the manufacturer can say whether a
  specific VIN still has it outstanding, so treating "12 recalls" as "12 open
  recalls" would misinform the buyer. It never penalises the Recalls score.
- **Insurance** in the ownership estimate is province-aware (a provincial
  market-average base, with the per-model risk tier layered on top), and the
  monthly-payment estimate uses the listing's provincial tax — neither is a
  single flat national number.
