import pandas as pd
import requests
from bs4 import BeautifulSoup
import re
import time
from urllib.parse import urljoin, urlparse

# ==========================================
# CONFIGURATION
# ==========================================
FILE_INPUT = '202604_HACKATHON _EugeniaSchool_usecase2 - Use case 1 - Sample Brand.csv'
FILE_OUTPUT = 'marques_enrichies_complet.csv'

TARGET_PAGES = ['contact', 'about', 'propos', 'legal', 'mentions', 'terms', 'cgv', 'privacy']

# ==========================================
# FONCTIONS D'EXTRACTION AVANCÉES
# ==========================================
def extract_year(text):
    match = re.search(r"(?:established|founded|est\.|depuis|fondé[e]? en|créé[e]? en)\s*(19\d{2}|20[0-2]\d)", text, re.IGNORECASE)
    return match.group(1) if match else ""

def extract_french_zipcode(text):
    # Cherche un code postal français suivi d'une ville
    matches = re.findall(r"\b(\d{5})\s+([A-ZÉÀÈ][a-zA-Z\-\é\è\à]+)\b", text)
    if matches:
        return f"{matches[0][0]} {matches[0][1]}"
    return ""

def extract_legal_status(text):
    # Traque les statuts juridiques internationaux et français
    match = re.search(r"\b(SASU?|SARL|SA|SNC|LLC|Inc\.?|Ltd\.?|GmbH|S\.?p\.?A\.?)\b", text)
    return match.group(1).replace('.', '') if match else ""

def extract_employees(text):
    # Tente de trouver des mentions du nombre d'employés
    match = re.search(r"\b(\d{1,5})\s+(?:employees|collaborateurs|salariés|personnes)\b", text, re.IGNORECASE)
    return match.group(1) if match else ""

def get_links_to_visit(soup, base_url):
    links_to_visit = set()
    domain = urlparse(base_url).netloc
    for a in soup.find_all('a', href=True):
        href = a['href']
        full_url = urljoin(base_url, href)
        if urlparse(full_url).netloc == domain:
            if any(keyword in href.lower() for keyword in TARGET_PAGES):
                links_to_visit.add(full_url)
    return list(links_to_visit)[:5] # On visite jusqu'à 5 pages pertinentes

# ==========================================
# FONCTION DE SCRAPING PRINCIPALE
# ==========================================
def scrape_brand_data(base_url):
    if pd.isna(base_url) or not isinstance(base_url, str):
        return None
    
    if not base_url.startswith('http'):
        base_url = 'https://' + base_url

    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36'}
    
    data = {
        "category": "",
        "creation_date": "",
        "adresse_siege_social": "",
        "type_entreprise": "",
        "nb_employees": "",
        "pages_visited": 0
    }
    
    try:
        # 1. VISITE DE LA PAGE D'ACCUEIL
        res = requests.get(base_url, headers=headers, timeout=10)
        res.raise_for_status()
        soup = BeautifulSoup(res.text, 'html.parser')
        data["pages_visited"] += 1
        
        # SEO Catégorie
        meta_desc = soup.find('meta', attrs={'name': 'description'}) or soup.find('meta', attrs={'property': 'og:description'})
        if meta_desc and 'content' in meta_desc.attrs:
            data["category"] = meta_desc['content'].strip()[:200]
            
        home_text = soup.text
        data["creation_date"] = extract_year(home_text)
        data["type_entreprise"] = extract_legal_status(home_text)
        
        # 2. CHERCHER LES SOUS-PAGES STRATÉGIQUES
        target_urls = get_links_to_visit(soup, base_url)
        
        # 3. VISITER LES SOUS-PAGES
        for target_url in target_urls:
            try:
                sub_res = requests.get(target_url, headers=headers, timeout=8)
                sub_soup = BeautifulSoup(sub_res.text, 'html.parser')
                data["pages_visited"] += 1
                text_content = sub_soup.text
                
                # Enrichissement progressif (si non trouvé précédemment, on remplit)
                if not data["creation_date"]:
                    data["creation_date"] = extract_year(text_content)
                if not data["adresse_siege_social"]:
                    data["adresse_siege_social"] = extract_french_zipcode(text_content)
                if not data["type_entreprise"]:
                    data["type_entreprise"] = extract_legal_status(text_content)
                if not data["nb_employees"]:
                    data["nb_employees"] = extract_employees(text_content)
                        
            except:
                pass
                
        return data

    except Exception as e:
        return None

# ==========================================
# EXECUTION PRINCIPALE
# ==========================================
def main():
    try:
        df = pd.read_csv(FILE_INPUT)
    except FileNotFoundError:
        print(f"❌ Le fichier {FILE_INPUT} est introuvable.")
        return

    results = []

    print(f"\n🚀 Démarrage du Scraping B2B Maximal (Total: {len(df)} marques)\n")

    for index, row in df.iterrows():
        brand = row['Brand Name']
        url = row['brandUrl']
        
        print(f"[{index+1}/{len(df)}] 🌐 Analyse de {brand} ({url})...")
        
        data = scrape_brand_data(url)
        
        if data:
            print(f"      ↳ 📄 Pages : {data['pages_visited']}")
            print(f"      ↳ 🏷️  Catégorie  : {data['category'][:40]}..." if data['category'] else "      ↳ 🏷️  Catégorie  : --")
            print(f"      ↳ 📅 Création   : {data['creation_date'] if data['creation_date'] else '--'}")
            print(f"      ↳ 📍 Adresse    : {data['adresse_siege_social'] if data['adresse_siege_social'] else '--'}")
            print(f"      ↳ 🏢 Statut     : {data['type_entreprise'] if data['type_entreprise'] else '--'}")
            print(f"      ↳ 👥 Employés   : {data['nb_employees'] if data['nb_employees'] else '--'}")
            
            results.append({
                "id": brand,
                "category": data["category"],
                "creation_date": data["creation_date"],
                "adresse_siege_social": data["adresse_siege_social"],
                "rating": "", # Impossible via web scraping pur
                "type_entreprise": data["type_entreprise"],
                "nb_employees": data["nb_employees"],
                "nb_clients": "", # Impossible
                "nb_societies": "", # Impossible
                "nb_societies_interna...": "", # Impossible
                "sales": "" # Impossible
            })
        else:
            print(f"      ↳ ❌ Site inaccessible.")
            results.append({
                "id": brand, "category": "", "creation_date": "", "adresse_siege_social": "", 
                "rating": "", "type_entreprise": "", "nb_employees": "", "nb_clients": "", 
                "nb_societies": "", "nb_societies_interna...": "", "sales": ""
            })
            
        print("-" * 40)
        time.sleep(1)

    # Sauvegarde avec les noms EXACTS des colonnes Airtable
    final_df = pd.DataFrame(results)
    final_df.to_csv(FILE_OUTPUT, index=False, encoding='utf-8-sig')
    print(f"\n✅ Terminé ! Le fichier parfait pour Airtable est prêt : '{FILE_OUTPUT}'.")

if __name__ == "__main__":
    main()