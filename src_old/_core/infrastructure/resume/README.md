This will include the logic engine used for building top-tier resumes

Thinking Board:
    Resume Components:
        Header:     PRIORITY
            - Full Name
            - Contact Info (email, phone, location, GitHub, LinkedIn, portfolio, website)
            - Additional Info (citizenship, work authorization, security clearance, preferred pronouns)

        Summary / Objective:
            - Career objective statement
            - Professional summary or branding statement
            - Key highlights of skills/experience

        Education:  PRIORITY
            - Degree(s) (with field of study)
            - Institution(s)
            - Graduation date(s) (or expected)
            - GPA (if relevant)
            - Relevant coursework
            - Academic honors/awards
            - Thesis/dissertation (if applicable)
            - Study abroad programs

        Experience: PRIORITY
            - Job title
            - Company/organization
            - Location
            - Dates of employment
            - Responsibilities
            - Achievements
            - Quantifiable results/impact
            - Internships
            - Co-ops
            - Teaching/assistantships
            - Freelance/contract work

        Projects:   PRIORITY
            - Project title
            - Tools/technologies used
            - Role and contributions
            - Description
            - Results/impact
            - Personal projects
            - Hackathons/maker competitions

        Skills:     PRIORITY
            - Technical skills (languages, frameworks, libraries, tools, platforms)
            - Software proficiency
            - Hardware/equipment
            - Methodologies (Agile, DevOps, etc.)
            - Soft skills (communication, leadership, teamwork, problem-solving)
            - Foreign languages (with proficiency levels)
            - Certifications
            - Licenses

        Research / Publications:
            - Research title
            - Institution/organization
            - Summary
            - Publications (conference/journal)
            - Posters/presentations
            - Patents

        Leadership / Extracurricular:
            - Role/title
            - Organization
            - Dates
            - Contributions/impact
            - Clubs/associations
            - Student government
            - Professional societies

        Awards & Honors:
            - Award title
            - Grant/scholarship/fellowship
            - Organization
            - Date
            - Reason/achievement

        Volunteer Experience:
            - Role
            - Organization
            - Dates
            - Contributions/impact
            - Community service

        Professional Development:
            - Workshops
            - Certifications
            - Training
            - Conferences attended
            - Bootcamps
            - Online courses (Coursera, edX, etc.)

        Portfolio:
            - Online portfolio link
            - Showcase of work (designs, code, writing samples)

        Presentations / Speaking Engagements:
            - Title of talk
            - Event/organization
            - Date
            - Audience/impact

        Associations / Memberships:
            - Professional organizations
            - Membership level (member, officer, etc.)
            - Involvement details

        Interests (optional, if relevant):
            - Hobbies
            - Activities
            - Passions that connect to role/industry

        References:
            - Available upon request
            - Or list of references (name, title, organization, contact info, relationship)



Resume Nature Language Engine (resume) Components:
    Common Tools:
        - Latex Compiler (make new worker node)
        - Line counter (calculate how many lines the documet takes)
        - Document quick editor (interface for viewing a rendered PDF and quick buttons to edit text automatically with NLP summarizers, LLM reqs, etc...)
        - Resume Scorer (RE combination version combined w/ LLM version)
        - Job description parser (for more effective recommendations)
        - Section mover (IE internal coop job apps move education to bottom)

    Header Rule Enforcer (RE):
        Contract:
            - Inputs: Header object { fullName, email, phone?, location?, links[], extras? }
            - Output: Normalized header object + violations[]
            - Success: Readable, single-line (or two-line max) header with clean contact info and optional extras that don’t introduce bias
        Checks (enforce/auto-fix):
            - Required: fullName (non-empty, no ALL CAPS unless style choice is consistent elsewhere; avoid thin fonts by template)
            - Email: exactly one; modern provider; no college email unless prestigious; plain text (no labels like "Email:")
            - Phone (optional): if present, no label prefix; for US/CA omit country code; format (###) ###-#### or ###-###-####
            - Location: optional; if present, city, ST format; skip full address/ZIP
            - Links: allow GitHub/portfolio/website; omit verbose https://www; ensure reachable format and human-friendly text
            - LinkedIn: generally unnecessary; if present, only if value-add and customized URL
            - Work status: include only if relevant (citizenship/visa/security clearance) and keep concise
            - Excluded: physical address, age, gender, marital status, religion, politics, photos/icons/graphics
            - Layout: single-column resume, header should not include icons; keep color black
        Normalization:
            - Trim spaces, collapse multiple spaces, standardize separators as " · "
            - Deduplicate links; order by relevance (Portfolio/GitHub → Website → LinkedIn)
            - Convert long URLs to bare domain/path (no protocol)
        Violations emitted with fix suggestions for each failed rule
    
    Education Rule Enforcer (RE):
        Contract:
            - Inputs: list<EducationEntry { institution, degree, field?, gradMonth?, gradYear, gpa?, honors?, awards?, coursework?[] }>, profileLevel
            - Output: normalized list + violations[]
            - Success: Reverse-chronological degrees only, concise details, GPA only if strong
        Checks (enforce/auto-fix):
            - Include only degrees that resulted in an award; exclude high school and non-completed schools
            - Order entries reverse-chronologically by gradYear then gradMonth
            - Dates: display full year; month optional but consistent; use en-dash (–) with spaces if ranges appear (e.g., programs) and use "Present" if ongoing
            - Start dates: omit; only graduation/expected graduation
            - GPA: include only if high (≥ 3.75); show with 2 decimals (e.g., 3.78)
            - Coursework: omit unless highly specialized/"really cool"
            - School location: omit if implied by name or commonly known
            - Honors/scholarships: include only if impressive; otherwise omit to save space
            - Section order policy signal:
                - Students/new grads: Education first
                - Professionals: Education last; remove GPA unless very impressive
        Normalization:
            - Degree formatting: "Degree, Field" (e.g., "B.S., Computer Science")
            - Institution then location (optional), right-align graduation date
            - Collapse unnecessary labels ("Degree:") and punctuation; use commas over pipes/dashes
        Violations emitted with fix suggestions
    
    Skills Rule Enforcer (RE) & Builder:
        RE:
            Contract:
                - Inputs: SkillsSection { categories: Map<CategoryName, list<skill>> } + resume bullets text corpus
                - Output: normalized SkillsSection + violations[]
                - Success: ≤ 3 lines total, single column, categorized, comma-separated, matches body keywords
            Checks (enforce/auto-fix):
                - Title must be "Skills"
                - Keep to ≤ 3 lines when rendered; use line counter to enforce and suggest pruning
                - Format: single column, categories with commas between items; no pipes or hyphen separators
                - Categories recommended: Languages, Frameworks/Libraries, Tools, Cloud/Platforms, Databases, Testing/CI; can be omitted if empty
                - No soft skills (leadership, teamwork, communication); show those via bullets, not here
                - Include only skills reasonably demonstrable; remove trivial/assumed (Word, typing, basic IDE)
                - Order categories and items by relevance to target role and frequency in bullets
                - Ensure every listed skill appears in at least one bullet in Experience/Projects (otherwise flag or drop)
                - Deduplicate and normalize casing (e.g., JavaScript, not javascript)
            Normalization:
                - Canonicalize skill synonyms (Node.js/Node, PyTorch/PyTorch)
                - Sort by relevance → proficiency → alphabetical as tie-breaker
            Violations emitted with suggested removals and merges
        Builder:
            - Parse given prior experiences / repo information (would like to actually parse a github w/ the agent but not mandatory for MVP)
            - Follow rules & continuously call RE to ensure proper formatting
            - Intelligently build multiple versions and recommend most coverage / valuable according to job desc
            - Derive candidate skills by:
                - NER/regex from bullets and project descriptions
                - Repo scan (package manifests, requirements, Dockerfiles) when available
                - JD keyword extraction; compute overlap score
            - Score each skill: frequency in bullets, JD match, recency; drop low-scoring until within 3-line limit
            - Group skills into concise categories; prefer fewer, denser categories
            - Ensure coherence: if a skill remains, guarantee at least one supporting bullet; otherwise propose a micro-edit to add context or remove the skill
    
    Experience / Project RE & Builder:
        RE:
            Contract:
                - Inputs: list<ExperienceEntry { title, company, location?, start?, end?, bullets[] }>, list<ProjectEntry { name, link?, tech[], bullets[] }>
                - Output: normalized sections + violations[]
                - Success: Impact-focused bullets (1–2 lines), strong verbs, quantified results, right-aligned dates
            Shared checks (Experience & Projects):
                - Bullets:
                    - 1–2 lines each; prefer 1 sentence; no trailing periods
                    - Start with strong past-tense action verb; no pronouns (I/We)
                    - Apply STAR/XYZ/CAR framing; pull metrics toward the start
                    - Avoid single-word wraps and hyphenation at line ends (layout/template responsibility; flag overlong bullets)
                    - Avoid sub-bullets unless necessary
                    - Limit adjectives/adverbs; keep concrete
                - Dates: use full years; months if used must be consistent; use en-dash with spaces; use "Present" for ongoing
                - Order bullets and entries by relevance/impressiveness to target role
                - Tailor keywords to JD; ensure alignment with Skills section
            Experience-specific:
                - Section title: "Work Experience" or "Experience"
                - Include paid roles and research; clearly label internships/contracts
                - Provide context, technical challenges, outcomes/impact
            Projects-specific:
                - Section title: "Projects" (avoid prefixes like "Personal/Relevant")
                - Include personal/extracurricular projects not duplicated in Experience
                - Titles capitalized; roles/dates optional; include link if public
                - Prefer "real" projects with usage/maintained over trivial tutorials
            Normalization:
                - Action verb normalization (maintained → maintained; led → led, not lead)
                - Quantification helper: detect numbers/%, time/cost/throughput; prompt to add if missing
                - Keyword harmonization with Skills and JD
            Violations emitted per bullet/entry with suggested rewrites
        Builder:
            - Prompt user to explain past experiences & parse w/ llm AND use past experience bank
            - Follow rules to create bullet points, keep track of coverage of job description
            - LLM iterator to improve individual bullet points
            - Soft skills tracker to ensure full coverage
            - Workflow:
                - Collect role context (IC vs management, experience level) to inform section ordering and tone
                - Generate bullets using XYZ template: "Accomplished [X] measured by [Y] by doing [Z]"
                - Auto-insert metrics from available data (users, latency, cost, revenue, defects) or prompt user for numbers
                - Rank bullets by relevance/impressiveness; keep 3–6 per role, 2–4 per project
                - Enforce style: 1–2 lines, no periods, strong verbs, no pronouns
                - Ensure cross-consistency: each bullet’s technologies appear in Skills; missing tech are added or bullet is adjusted
                - For internships/contracts, prepend clear label (e.g., "Software Engineering Intern")
                - For Projects, add repo/portfolio link if substantive; skip if it adds no value
            - Length control:
                - Use line counter to cap total resume to 1 page for <10 years experience; otherwise aim ≤ 2 pages for senior
                - If overflow, prune least-relevant bullets first, then compress wording; never shrink font below template minimum or add columns