#!/usr/bin/env python3
"""
Reconcile and finalize Review 2 reports (Report 1, 2, 3, 5).
Removes template residue, duplicate rows, placeholder text, and aligns
all figures, tables, and counts with the 23-page diagram set and 82 test cases.
"""

import docx
from docx.shared import Pt, Inches, RGBColor

def set_cell_text(cell, text, bold=False):
    cell.text = text
    p = cell.paragraphs[0]
    p.paragraph_format.space_before = Pt(2)
    p.paragraph_format.space_after = Pt(2)
    if bold and len(p.runs) > 0:
        p.runs[0].bold = True

def remove_row(table, row_idx):
    tr = table.rows[row_idx]._tr
    tr.getparent().remove(tr)

def add_table_row(table, cells_data, bold=False):
    row = table.add_row()
    for idx, text in enumerate(cells_data):
        if idx < len(row.cells):
            set_cell_text(row.cells[idx], text, bold=bold)
    return row

def update_report_1():
    path = 'docs/review-2/02-reports/report-1/SEP490_FA26SE183_R2_Report1.docx'
    doc = docx.Document(path)
    
    # 1. Update Record of Changes (Table 0)
    t0 = doc.tables[0]
    set_cell_text(t0.rows[1].cells[0], '27/10/2026')
    set_cell_text(t0.rows[1].cells[1], 'M')
    set_cell_text(t0.rows[1].cells[2], 'Lê Nguyễn Quang Đức')
    set_cell_text(t0.rows[1].cells[3], 'Reconcile project title to approved identity, remove duplicate member row, and update diagram baseline to 23 pages (12 ERDs).')
    
    # 2. Update Table 1: remove duplicate member row 5
    t1 = doc.tables[1]
    if len(t1.rows) > 5 and t1.rows[5].cells[0].text.strip() == t1.rows[4].cells[0].text.strip():
        remove_row(t1, 5)
        print('Report 1: Removed duplicate member row in Table 1')
        
    # 3. Update paragraphs: project name and diagram inventory
    for p in doc.paragraphs:
        if p.text.startswith('Project name:'):
            p.text = 'Project name: VISTA: Vision-Language-Action System for Tabletop Manipulation with Dual Robot Arms (Platform: VISTA — Robotics & AI Education Platform)'
        elif '22-page editable diagram set' in p.text:
            p.text = p.text.replace('22-page editable diagram set', '23-page authoritative diagram set (including separate 16a and 16b ERD pages)')
            p.text = p.text.replace('four Logical domain ERDs', 'five Logical domain ERDs')
            
    doc.save(path)
    print('Report 1 successfully updated!')

def update_report_2():
    path = 'docs/review-2/02-reports/report-2/SEP490_FA26SE183_R2_Report2.docx'
    doc = docx.Document(path)
    
    # 1. Record of Changes
    t0 = doc.tables[0]
    set_cell_text(t0.rows[1].cells[0], '27/10/2026')
    set_cell_text(t0.rows[1].cells[1], 'M')
    set_cell_text(t0.rows[1].cells[2], 'Lê Nguyễn Quang Đức')
    set_cell_text(t0.rows[1].cells[3], 'Remove template residue (MySQL/GitLab/Eclipse), fill actual technology stack versions and deliverables, and align diagram inventory to 23 pages.')

    # 2. Table 1 (WBS)
    t1 = doc.tables[1]
    if len(t1.rows) >= 8:
        set_cell_text(t1.rows[7].cells[0], '7')
        set_cell_text(t1.rows[7].cells[1], 'Review 2 Documentation Package')
        set_cell_text(t1.rows[7].cells[2], 'Medium (planning estimate)')
        set_cell_text(t1.rows[7].cells[3], 'Estimate pending team validation')

    # 3. Table 2 (Testing Stage)
    t2 = doc.tables[2]
    stages = [
        ('1', 'Reviewing', 'SRS, SDD, Architecture & ERD diagrams', '0', '0%'),
        ('2', 'Unit Test', 'Education API (NestJS) & Web (Vitest)', '0', '0%'),
        ('3', 'Integration Test', 'Database constraints & scope authorization', '0', '0%'),
        ('4', 'System Test', '4 Main Workflow demonstrations (Defense 1.1 target)', '0', '0%'),
        ('5', 'Acceptance Test', 'Mandatory scenario checklist (Defense 1.1 target)', '0', '0%')
    ]
    for idx, data in enumerate(stages, 1):
        if idx < len(t2.rows):
            for c_idx, val in enumerate(data):
                set_cell_text(t2.rows[idx].cells[c_idx], val)

    # 4. Table 3 (Risks)
    t3 = doc.tables[3]
    # Keep row 1, add rows 2 and 3 if needed
    if len(t3.rows) == 2:
        add_table_row(t3, ['2', 'Cross-school authorization and multi-tenant data leakage', 'High', 'Medium', 'Enforce strict JWT validation, organization/classroom scope guards, and automated negative test suites'])
        add_table_row(t3, ['3', 'Diagram states and ERD constraints mismatch implementation', 'High', 'Medium', 'Perform rigorous cross-document audit against Prisma schema, migrations, and NestJS service enums'])

    # 5. Table 4 (Training Plan)
    t4 = doc.tables[4]
    training = [
        ('Hardware safety & tabletop robot control protocols', 'All members', 'Week 4-5, 8 hours', 'Mandatory'),
        ('Prisma schema migrations & PostgreSQL transaction locking', 'Đức, Lợi', 'Week 3, 6 hours', 'Mandatory'),
        ('Git feature branch workflow & CI test automation', 'All members', 'Week 2, 4 hours', 'Mandatory')
    ]
    for idx, data in enumerate(training[:len(t4.rows)-1], 1):
        for c_idx, val in enumerate(data):
            set_cell_text(t4.rows[idx].cells[c_idx], val)
    if len(t4.rows) < 4:
        add_table_row(t4, list(training[2]))

    # 6. Table 5 (Deliverables)
    t5 = doc.tables[5]
    delivs = [
        ('1', 'Registration Form v1.2 & Record of Changes BM03', 'Review 2', 'Formal project scope baseline'),
        ('2', 'Reports 1-5 (Introduction, Plan, SRS, SDD, Test Documentation)', 'Review 2', 'Complete technical documentation package'),
        ('3', 'Design Brief BM01 & Self-Review Form BM02', 'Review 2', 'Official university evaluation forms'),
        ('4', '23-Page Authoritative Architecture & ERD Diagrams', 'Review 2', 'C4 Level 1-3, 4 Workflows, 4 State Machines, 12 ERDs'),
        ('5', 'PostgreSQL Database Migrations & Seed Script', 'Review 2', 'Reproducible schema and test data'),
        ('6', 'Automated Test Suites & Execution Evidence Record', 'Review 2', 'Jest & Vitest test suites with local verification log')
    ]
    for c_idx, val in enumerate(delivs[0]):
        set_cell_text(t5.rows[1].cells[c_idx], val)
    for d in delivs[1:]:
        add_table_row(t5, list(d))

    # 7. Table 7 (Communications)
    t7 = doc.tables[7]
    comms = [
        ('Weekly Team Standup', 'All members', 'Review progress, resolve blockers, assign PRs', 'Weekly, 1 hour', 'In-person / Discord'),
        ('Advisor Sync Meeting', 'Team & Supervisor', 'Report progress, receive feedback, approve scope', 'Bi-weekly, 1 hour', 'FPT University / Google Meet'),
        ('Code & Document PR Review', 'Team members', 'Peer review changes before merging into main', 'Continuous on PR', 'GitHub PRs')
    ]
    for idx, data in enumerate(comms[:len(t7.rows)-1], 1):
        for c_idx, val in enumerate(data):
            set_cell_text(t7.rows[idx].cells[c_idx], val)
    if len(t7.rows) < 4:
        add_table_row(t7, list(comms[2]))

    # 8. Table 8 (Tools / Infrastructure)
    t8 = doc.tables[8]
    tools = [
        ('Technology', 'React 18, Vite 5, NestJS 11, TypeScript 5.9, Python 3.10+'),
        ('Database', 'PostgreSQL 15+, Supabase, Prisma ORM 5.21'),
        ('IDEs/Editors', 'Visual Studio Code, Cursor'),
        ('Diagramming', 'Diagrams.net (Draw.io), Mermaid'),
        ('Documentation', 'Microsoft Word, Microsoft Excel, Markdown'),
        ('Version Control', 'Git, GitHub (Repository: SKYNET-Thesis/se)'),
        ('Testing Tools', 'Jest 30.5, Vitest 2.1, Playwright'),
        ('Deployment / Staging', 'Docker, GitHub Actions (AWS ECS/RDS planned for Defense 1.1)')
    ]
    for idx, (cat, val) in enumerate(tools, 1):
        if idx < len(t8.rows):
            set_cell_text(t8.rows[idx].cells[0], cat)
            set_cell_text(t8.rows[idx].cells[1], val)
        else:
            add_table_row(t8, [cat, val])

    # 9. Update paragraphs
    for p in doc.paragraphs:
        if '22-page diagram source' in p.text:
            p.text = p.text.replace('22-page diagram source', '23-page diagram source')
            p.text = p.text.replace('4 Logical ERDs', '5 Logical ERDs (including separate 16a and 16b)')

    doc.save(path)
    print('Report 2 successfully updated!')

def update_report_3():
    path = 'docs/review-2/02-reports/report-3-srs/SEP490_FA26SE183_R2_Report3.docx'
    doc = docx.Document(path)

    # 1. Record of Changes
    t0 = doc.tables[0]
    set_cell_text(t0.rows[1].cells[0], '27/10/2026')
    set_cell_text(t0.rows[1].cells[1], 'M')
    set_cell_text(t0.rows[1].cells[2], 'Lê Nguyễn Quang Đức')
    set_cell_text(t0.rows[1].cells[3], 'Expand use case and feature tables to all 8 mandatory FRs, remove NFR template placeholder text, and update ERD baseline reference to 23 pages (12 ERDs).')

    # 2. Table 2: Use Cases (expand to 8 FRs)
    t2 = doc.tables[2]
    uc_data = [
        ('UC-01', 'Authentication and role-scoped access', 'System Admin / School Admin / Teacher / Student', 'Requests require valid user, active membership, and scoped authorization; cross-organization access is denied.'),
        ('UC-02', 'Classroom robot allocation and governance', 'School Admin', 'Only an entitled robot can be allocated to an owned classroom; conflicting active allocations are atomically rejected.'),
        ('UC-03', 'Lesson preparation and assignment publication', 'Teacher', 'Authorized teacher creates and publishes classroom assignments; unauthorized publish requests are rejected.'),
        ('UC-04', 'Immutable program versioning and submission', 'Student', 'Learner edits RobotProgram drafts, generates immutable versions, and submits an eligible version for an active attempt.'),
        ('UC-05', 'Schematic experiment execution and symbolic evaluation', 'Student', 'Student requests a schematic experiment run; backend validates eligibility and persists truthful execution state and evidence.'),
        ('UC-06', 'Bounded physical robot execution through local runtime', 'Student, Robot Runtime', 'Physical execution requires active reservation, hardware readiness, and safety checks; failure or stop fails closed.'),
        ('UC-07', 'Teacher assessment, feedback, and student reflection', 'Teacher, Student', 'Teacher reviews submission evidence and records rubric assessment; student inspects feedback and records reflection.'),
        ('UC-08', 'AI model and dataset provenance metadata inspection', 'Student / Teacher / System Admin', 'Users view traceable model versions, training datasets, and evaluation metrics; external writes fail gracefully.')
    ]
    # Update existing rows or add
    for idx, data in enumerate(uc_data):
        row_idx = idx + 1
        if row_idx < len(t2.rows):
            for c_idx, val in enumerate(data):
                set_cell_text(t2.rows[row_idx].cells[c_idx], val)
        else:
            add_table_row(t2, list(data))

    # 3. Table 3: Features & Screens
    t3 = doc.tables[3]
    feat_screens = [
        ('1', 'Role-governed access & identity gate', 'Login & Access Gate', 'JWT authentication, organization context selection, and scope validation.'),
        ('2', 'Classroom robot allocation & governance', 'School Admin Dashboard', 'School-scoped classroom management and atomic robot allocation.'),
        ('3', 'Assignment creation & delivery', 'Teacher Course / Delivery View', 'Classroom assignment authoring, scheduling, and publication.'),
        ('4', 'Visual programming & version submission', 'Student Workspace / Blockly', 'Block-based coding, canonical AST compile, immutable versioning, and submission.'),
        ('5', 'Schematic experiment & symbolic evaluation', 'Experiment Console', 'Schematic execution simulation, trajectory verification, and artifact persistence.'),
        ('6', 'Bounded physical robot execution', 'Hardware Telemetry Monitor', 'Local device gateway status, readiness check, and supervised run dispatch.'),
        ('7', 'Teacher assessment & student reflection', 'Assessment & Feedback Portal', 'Rubric grading, feedback delivery, and student reflection records.'),
        ('8', 'AI model & dataset metadata inspection', 'Model / Dataset Registry', 'Traceable AI model cards, dataset versions, and benchmark evaluation metrics.')
    ]
    for idx, data in enumerate(feat_screens):
        row_idx = idx + 1
        if row_idx < len(t3.rows):
            for c_idx, val in enumerate(data):
                set_cell_text(t3.rows[row_idx].cells[c_idx], val)
        else:
            add_table_row(t3, list(data))

    # 4. Table 5: System Functions (FR-01 to FR-08)
    t5 = doc.tables[5]
    fr_funcs = [
        ('1', 'Authentication & Access Control', 'FR-01', 'System verifies Supabase JWT and enforces strict organization and classroom scope guards on all endpoints.'),
        ('2', 'Classroom Robot Allocation', 'FR-02', 'School Admin allocates an entitled robot to an owned classroom; atomic replacement prevents dual active allocations.'),
        ('3', 'Assignment Publication', 'FR-03', 'Teacher publishes classroom work; unauthorized actors or foreign teachers cannot publish or alter assignments.'),
        ('4', 'Versioned Program Submission', 'FR-04', 'Student creates immutable program versions and submits an attempt; other students cannot submit or alter work.'),
        ('5', 'Schematic Experiment Execution', 'FR-05', 'Student runs schematic simulation; backend persists deterministic execution logs, status, and evaluation results.'),
        ('6', 'Physical Execution Boundary', 'FR-06', 'System dispatches physical commands only to ready, reserved hardware; duplicate or unsafe commands fail closed.'),
        ('7', 'Assessment & Feedback Delivery', 'FR-07', 'Teacher submits score and feedback for student submission; student receives feedback and submits reflection.'),
        ('8', 'AI / Model Metadata Management', 'FR-08', 'Platform serves read-only metadata for AI model cards, dataset lineage, and evaluation metrics with zero false claims.')
    ]
    for idx, data in enumerate(fr_funcs):
        row_idx = idx + 1
        if row_idx < len(t5.rows):
            for c_idx, val in enumerate(data):
                set_cell_text(t5.rows[row_idx].cells[c_idx], val)
        else:
            add_table_row(t5, list(data))

    # 5. Clean NFR text placeholders in paragraphs
    for p in doc.paragraphs:
        txt = p.text
        if 'Availability—specify the percentage' in txt:
            p.text = 'Availability: The VISTA Learning Platform targets ≥99.0% service availability during scheduled school instructional hours (07:00–18:00 UTC+7).'
        elif 'Mean Time Between Failures' in txt:
            p.text = 'Mean Time Between Failures (MTBF): Targeted MTBF is ≥300 operating hours between unscheduled API or database service interruptions.'
        elif 'Mean Time To Repair' in txt:
            p.text = 'Mean Time To Repair (MTTR): Targeted MTTR is ≤2 hours for containerized API services in local and staging environments.'
        elif 'Accuracy—specifies precision' in txt:
            p.text = 'Accuracy: Robot program AST compilation and schematic trajectory evaluations are deterministic (100% precision with identical inputs).'
        elif 'Maximum Bugs or Defect Rate' in txt:
            p.text = 'Maximum Bugs or Defect Rate: Zero critical defects (data loss, privilege escalation, or unauthorized physical motion) permitted in release baselines.'
        elif 'Bugs or Defect Rate—categorized' in txt:
            p.text = 'Defect Severity Thresholds: Critical defects must be resolved within 24 hours; major defects within 5 business days; minor defects scheduled by sprint.'
        elif 'Response time for a transaction' in txt:
            p.text = 'Response Time: Ordinary authenticated REST API operations return within P95 ≤3.0 seconds under nominal classroom concurrency (30 concurrent users).'
        elif 'Throughput, for example, transactions' in txt:
            p.text = 'Throughput: Education API handles a minimum of 50 requests per second across typical reading, submitting, and evaluation workloads.'
        elif 'Capacity, for example, the number' in txt:
            p.text = 'Capacity: The database and API scale to support at least 1,000 active students and 10,000 immutable program versions per registered school.'
        elif 'Resource utilization, such as memory' in txt:
            p.text = 'Resource Utilization: API container memory utilization remains below 70% under standard instructional loads (512 MB memory limit).'
        elif p.text.strip() == '4.2.4 …':
            p.text = '4.2.4 Security & Safety'
        elif 'ERD baseline: aldia.xml' in txt:
            p.text = 'ERD baseline: diagramall.drawio.xml, 23 pages containing 12 ERDs. Conceptual ERD (page 12) outlines core business entities; five Logical ERDs (pages 13–16b, including separate 16a Programs & Assessment and 16b AI & Datasets) define normalized attributes and foreign keys; six Physical ERDs (pages 17–22) establish PostgreSQL data types, primary/foreign key constraints, and unique indexes.'

    doc.save(path)
    print('Report 3 successfully updated!')

def update_report_5():
    path = 'docs/review-2/02-reports/report-5-testing/SEP490_FA26SE183_R2_Report5.docx'
    doc = docx.Document(path)

    # 1. Record of Changes
    t0 = doc.tables[0]
    set_cell_text(t0.rows[1].cells[0], '27/10/2026')
    set_cell_text(t0.rows[1].cells[1], 'M')
    set_cell_text(t0.rows[1].cells[2], 'Lê Nguyễn Quang Đức')
    set_cell_text(t0.rows[1].cells[3], 'Populate concrete test types, tool versions, test team responsibilities, and staging environment details; align test case counts with 82 committed cases in Report5_TestReport.xlsx.')

    # 2. Table 1 (Type of Tests)
    t1 = doc.tables[1]
    test_types = [
        ('Functional & Business Logic', 'X', 'X', 'X'),
        ('Security & Scope Authorization', 'X', 'X', 'X'),
        ('Negative & Boundary Testing', 'X', 'X', 'X'),
        ('State Transition & Invariant Verification', 'X', 'X', 'X')
    ]
    for idx, data in enumerate(test_types):
        row_idx = idx + 2
        if row_idx < len(t1.rows):
            set_cell_text(t1.rows[row_idx].cells[0], data[0])
            set_cell_text(t1.rows[row_idx].cells[1], data[1])
            set_cell_text(t1.rows[row_idx].cells[2], data[2])
            set_cell_text(t1.rows[row_idx].cells[3], data[3])
        else:
            add_table_row(t1, [data[0], data[1], data[2], data[3], ''])

    # 3. Table 2 (Supporting Tools)
    t2 = doc.tables[2]
    tools = [
        ('Backend unit and integration testing', 'Jest', 'Open source', '30.5.2'),
        ('Frontend unit and component testing', 'Vitest', 'Open source', '2.1.9'),
        ('Database schema migration & client', 'Prisma ORM', 'Open source', '5.21.0')
    ]
    for idx, data in enumerate(tools[:len(t2.rows)-1], 1):
        for c_idx, val in enumerate(data):
            set_cell_text(t2.rows[idx].cells[c_idx], val)
    if len(t2.rows) < 4:
        add_table_row(t2, list(tools[2]))

    # 4. Table 3 (Human Resources)
    t3 = doc.tables[3]
    hrs = [
        ('Lê Nguyễn Quang Đức', 'Backend & QA Lead', 'Auth/RBAC, school administration, robot allocation, and CI test automation'),
        ('Trần Tiến Đạt', 'WF-02 Tester', 'Course delivery, classroom assignment publication, and program submission tests'),
        ('Vũ Anh Tuấn', 'WF-03 Tester', 'Schematic experiment execution, robot runtime client, and safety boundary tests'),
        ('Phạm Viết Lợi', 'WF-04 Tester', 'Assessment, rubric evaluation, student reflection, and AI metadata tests')
    ]
    for idx, data in enumerate(hrs[:len(t3.rows)-1], 1):
        for c_idx, val in enumerate(data):
            set_cell_text(t3.rows[idx].cells[c_idx], val)
    for data in hrs[len(t3.rows)-1:]:
        add_table_row(t3, list(data))

    # 5. Table 4 (Test Environment)
    t4 = doc.tables[4]
    envs = [
        ('Frontend Web Application', 'React 18.3.1 / Vite 5.2.0', 'In-house', 'Node.js 22.x'),
        ('Backend Education API', 'NestJS 11.0.0 / TypeScript 5.9.2', 'In-house', 'Node.js 22.x'),
        ('Relational Database', 'PostgreSQL 15+ / Supabase', 'Supabase / Docker', 'PostgreSQL 15'),
        ('Robot Device Runtime', 'Python 3.10+ / FastAPI / LeRobot', 'In-house', 'Python 3.10')
    ]
    for idx, data in enumerate(envs[:len(t4.rows)-1], 1):
        for c_idx, val in enumerate(data):
            set_cell_text(t4.rows[idx].cells[c_idx], val)
    for data in envs[len(t4.rows)-1:]:
        add_table_row(t4, list(data))

    # 6. Update paragraphs
    for p in doc.paragraphs:
        if 'Report5_Unit Test.xls' in p.text:
            p.text = 'Unit Test Cases: Automated Jest suites (192 tests in services/education-api) and Vitest suites (75 tests in web/robot-edu).'
        elif 'Report5_Test Report.xls]' in p.text or 'Other Test Cases (IT, ST, AT):' in p.text:
            p.text = 'Integration, System, and State Transition Test Cases: Fully specified in SEP490_FA26SE183_R2_TestReport.xlsx (82 proposed test cases).'

    doc.save(path)
    print('Report 5 successfully updated!')

if __name__ == '__main__':
    update_report_1()
    update_report_2()
    update_report_3()
    update_report_5()
    print('All reports updated cleanly!')
