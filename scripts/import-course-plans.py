"""Import the user's 30 planning workbooks without extracting untrusted archive paths."""
import io
import json
import re
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
METADATA = [
    ("Social Sciences", "General;Sociology;Social Science", 60, "Hybrid", "An anonymised 75–150-response community survey dataset, charts and a 1,500–2,500-word findings report."),
    ("Languages & Communication", "Bengali;English;Sanskrit", 60, "Online", "A professionally edited 20–30-page booklet with tracked corrections and a style sheet, using authorised text."),
    ("Arts & Heritage", "History;Bengali;Sanskrit", 120, "Hybrid", "A curated collection of 50–100 authorised digitised items, metadata and a contextual essay."),
    ("Social Sciences", "Political Science;History;General", 60, "Hybrid", "A sourced local civic profile, public-services inventory and two-page Bengali citizen explainer."),
    ("Education", "Education;Bengali;English", 60, "Online / Hybrid", "Four lesson plans, two worksheets, a supervised teaching recording or observation report and reflective diary."),
    ("Languages & Communication", "English;General;Business Administration", 60, "Online", "Professional emails, meeting minutes, client-response scripts, presentation and a two-page simulated business report."),
    ("Business & Finance", "Accountancy;Accounting & Finance;Commerce", 120, "Online", "A fictional month's books, reconciliation, GST working papers and management summary; no unsupervised real tax filing."),
    ("Business & Finance", "General;Commerce;Economics", 60, "Online / Hybrid", "An anonymised financial-literacy survey, household budget workbook and Bengali awareness resource; not investment advice."),
    ("Environment & Geography", "Geography;Environmental Science;Geology", 120, "Hybrid", "A georeferenced community map, field-validation log and short spatial-analysis report."),
    ("Technology & Data", "Mathematics;Computer Science;Statistics", 120, "Online", "A reproducible public-dataset analysis, cleaned data, Python notebook or spreadsheet, charts and findings memo."),
    ("Technology & Data", "Philosophy;English;Computer Science", 60, "Online", "An evidence-backed evaluation of 75–100 Bengali or English prompts, error taxonomy and responsible-AI recommendations."),
    ("Languages & Communication", "Journalism & Mass Communication;English;Political Science", 60, "Online / Hybrid", "Five fact-check files, two short news reports and a verification checklist with a traceable evidence trail."),
    ("Languages & Communication", "Bengali;English;Hindi", 60, "Online", "A bilingual terminology glossary, translated documents and subtitles for 15–25 minutes of authorised video."),
    ("Languages & Communication", "Journalism & Mass Communication;English;Business Administration", 60, "Online", "A four-week public-information campaign with 12–20 posts, captions, calendar and analytics template."),
    ("Arts & Heritage", "History;Bengali;Anthropology", 120, "Hybrid", "Three to five consented oral-history interviews, edited transcripts, metadata and contextual essay."),
    ("Social Sciences", "General;History;Political Science", 60, "Online / Hybrid", "An annotated bibliography of 20–30 sources, literature matrix, 2,000-word review and research proposal."),
    ("Education", "Education;Bengali;English", 60, "Online / Hybrid", "An 80–100-question bank, learning-outcome blueprint, marking scheme, worksheet and reviewer log."),
    ("Arts & Heritage", "History;Bengali;Library & Information Science", 120, "Hybrid", "A searchable collection catalogue, digitised sample records and a documented metadata dictionary."),
    ("Environment & Geography", "Zoology;Botany;Biological Sciences", 120, "Hybrid", "A non-invasive local biodiversity inventory, field notebook, identification evidence and illustrated ecological report."),
    ("Environment & Geography", "Botany;Environmental Science;Agriculture & Rural Development", 120, "Field / Hybrid", "A supervised propagation log, survival dataset and campus planting plan. Partner facilities and safe tools required."),
    ("Environment & Geography", "Geography;Chemistry;Environmental Science", 120, "Hybrid / Lab", "A safe supervised water-source comparison, sampling records and analysis. Student screening is not regulatory certification."),
    ("Science & Laboratory", "Microbiology;Molecular Biology & Biotechnology;Bio-Chemistry", 120, "Lab", "A low-risk supervised laboratory portfolio with methods, calculations, observations and QC notes; approved facilities required."),
    ("Health & Wellbeing", "Physiology;Nutrition;Food & Nutrition", 60, "Hybrid", "An anonymised nutrition survey, food-environment report and Bengali educational resource; no diagnostic advice."),
    ("Health & Wellbeing", "Physiology;Nutrition;Health Care", 60, "Hybrid", "A sourced public-health campaign, Bengali resources and knowledge feedback analysis; no diagnosis or prescriptions."),
    ("Health & Wellbeing", "Physical Education and Sports;Physical Education;Physiology", 120, "Field / Hybrid", "Supervised fitness-session plans, non-sensitive participant logs, coaching diary and evaluation; qualified supervisor required."),
    ("Technology & Data", "Physics;Electronics;Mathematics & Computer Science", 120, "Lab / Hybrid", "A safe low-voltage sensor prototype, circuit diagram, bill of materials, code and test results; partner hardware required."),
    ("Science & Laboratory", "Mathematics;Physics;Physical Science", 60, "Lab / Hybrid", "Three supervised measurement experiments, traceable raw observations, uncertainty analysis and capstone report."),
    ("Science & Laboratory", "Chemistry;Bio-Chemistry;Industrial Chemistry", 120, "Lab", "Supervised analytical exercises, safety checklists, calculations and a comparative-analysis project at an approved lab."),
    ("Arts & Heritage", "Hospitality and Tourism Management;History;Geography", 60, "Hybrid", "A two- or three-day West Bengal itinerary, annotated map, costing sheet, accessible visitor pack and heritage script."),
    ("Business & Finance", "Commerce;Business Administration;Business Management", 60, "Online / Hybrid", "A simulated microbusiness operations pack: CRM records, sales analysis, stock tracker, SOP and improvement memo."),
]

def rows(book, name, strings):
    result = []
    for row in ET.fromstring(book.read(name)).findall(".//m:row", NS):
        cells = {}
        for c in row.findall("m:c", NS):
            v = c.find("m:v", NS)
            inline = c.find("m:is", NS)
            value = strings[int(v.text)] if c.get("t") == "s" and v is not None else "".join(inline.itertext()) if inline is not None else v.text if v is not None else ""
            cells[re.sub(r"\d", "", c.get("r", ""))] = value
        result.append(cells)
    return result

def number(value):
    try:
        return float(value or 0)
    except ValueError:
        return 0

archive = zipfile.ZipFile(ROOT / "attached_assets/Adhyayan_30_Course_Build_Plans_1794809520143.zip")
courses = []
for index, path in enumerate(sorted(p for p in archive.namelist() if p.endswith(".xlsx"))):
    workbook = zipfile.ZipFile(io.BytesIO(archive.read(path)))
    strings = ["".join(t.itertext()) for t in ET.fromstring(workbook.read("xl/sharedStrings.xml")).findall("m:si", NS)] if "xl/sharedStrings.xml" in workbook.namelist() else []
    start = rows(workbook, "xl/worksheets/sheet1.xml", strings)
    title = re.sub(r"^Internship \d+:\s*| - Course Build Plan$", "", start[0].get("A", ""))
    category, disciplines, hours, mode, deliverable = METADATA[index]
    modules = []
    for row in rows(workbook, "xl/worksheets/sheet2.xml", strings):
        if not row.get("A", "").isdigit() or not row.get("B"):
            continue
        modules.append({
            "id": f"{index+1:02d}-{row['A']}",
            "title": row["B"],
            "type": row.get("C", "Core"),
            "hours60": number(row.get("D")),
            "hours120": number(row.get("E")),
            "content": f"Planning blueprint: {row['B']}. Document your practical work, evidence and reflections for supervisor discussion. Detailed lesson material and assessment handouts are in development. Use the AI tutor for guided explanations; it does not replace a qualified supervisor.",
        })
    courses.append({
        "id": f"{index+1:02d}", "title": title, "category": category,
        "description": f"Build practical skills through {title.lower()}. Complete guided work and an evidence-based portfolio mapped to {disciplines.split(';')[0]} and related disciplines.",
        "hours": hours, "price": 500 if hours == 60 else 1000, "mode": mode,
        "disciplines": disciplines.split(";"), "modules": modules, "deliverable": deliverable,
        "draft": True, "extendedDraft": True,
    })
output = ROOT / "artifacts/api-server/src/data/courses.json"
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(courses, ensure_ascii=False, indent=2))
print(f"Imported {len(courses)} course blueprints and {sum(len(c['modules']) for c in courses)} modules.")
