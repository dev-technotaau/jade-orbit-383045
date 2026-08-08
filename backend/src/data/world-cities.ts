export interface WorldCity {
  text: string;
  region: string;
  state?: string;
}

export const WORLD_CITIES: WorldCity[] = [
  // ============================================================
  // United States (US) — ~110 cities
  // ============================================================
  // California
  { text: 'San Francisco, California, USA', region: 'US', state: 'California' },
  { text: 'San Jose, California, USA', region: 'US', state: 'California' },
  { text: 'Palo Alto, California, USA', region: 'US', state: 'California' },
  { text: 'Mountain View, California, USA', region: 'US', state: 'California' },
  { text: 'Sunnyvale, California, USA', region: 'US', state: 'California' },
  { text: 'Cupertino, California, USA', region: 'US', state: 'California' },
  { text: 'Menlo Park, California, USA', region: 'US', state: 'California' },
  { text: 'Redwood City, California, USA', region: 'US', state: 'California' },
  { text: 'Oakland, California, USA', region: 'US', state: 'California' },
  { text: 'Berkeley, California, USA', region: 'US', state: 'California' },
  { text: 'Sacramento, California, USA', region: 'US', state: 'California' },
  { text: 'Los Angeles, California, USA', region: 'US', state: 'California' },
  { text: 'San Diego, California, USA', region: 'US', state: 'California' },
  { text: 'Irvine, California, USA', region: 'US', state: 'California' },
  { text: 'Santa Monica, California, USA', region: 'US', state: 'California' },
  { text: 'Pasadena, California, USA', region: 'US', state: 'California' },
  { text: 'Santa Clara, California, USA', region: 'US', state: 'California' },
  { text: 'Fremont, California, USA', region: 'US', state: 'California' },
  { text: 'Long Beach, California, USA', region: 'US', state: 'California' },
  { text: 'Burbank, California, USA', region: 'US', state: 'California' },
  // Washington
  { text: 'Seattle, Washington, USA', region: 'US', state: 'Washington' },
  { text: 'Bellevue, Washington, USA', region: 'US', state: 'Washington' },
  { text: 'Redmond, Washington, USA', region: 'US', state: 'Washington' },
  { text: 'Kirkland, Washington, USA', region: 'US', state: 'Washington' },
  // Oregon
  { text: 'Portland, Oregon, USA', region: 'US', state: 'Oregon' },
  { text: 'Eugene, Oregon, USA', region: 'US', state: 'Oregon' },
  // Texas
  { text: 'Austin, Texas, USA', region: 'US', state: 'Texas' },
  { text: 'Dallas, Texas, USA', region: 'US', state: 'Texas' },
  { text: 'Houston, Texas, USA', region: 'US', state: 'Texas' },
  { text: 'San Antonio, Texas, USA', region: 'US', state: 'Texas' },
  { text: 'Plano, Texas, USA', region: 'US', state: 'Texas' },
  { text: 'Arlington, Texas, USA', region: 'US', state: 'Texas' },
  { text: 'Fort Worth, Texas, USA', region: 'US', state: 'Texas' },
  { text: 'El Paso, Texas, USA', region: 'US', state: 'Texas' },
  { text: 'Irving, Texas, USA', region: 'US', state: 'Texas' },
  // Arizona
  { text: 'Phoenix, Arizona, USA', region: 'US', state: 'Arizona' },
  { text: 'Scottsdale, Arizona, USA', region: 'US', state: 'Arizona' },
  { text: 'Tempe, Arizona, USA', region: 'US', state: 'Arizona' },
  { text: 'Tucson, Arizona, USA', region: 'US', state: 'Arizona' },
  // Colorado
  { text: 'Denver, Colorado, USA', region: 'US', state: 'Colorado' },
  { text: 'Boulder, Colorado, USA', region: 'US', state: 'Colorado' },
  { text: 'Colorado Springs, Colorado, USA', region: 'US', state: 'Colorado' },
  // Illinois
  { text: 'Chicago, Illinois, USA', region: 'US', state: 'Illinois' },
  { text: 'Naperville, Illinois, USA', region: 'US', state: 'Illinois' },
  // New York
  { text: 'New York City, New York, USA', region: 'US', state: 'New York' },
  { text: 'Albany, New York, USA', region: 'US', state: 'New York' },
  { text: 'Buffalo, New York, USA', region: 'US', state: 'New York' },
  { text: 'Rochester, New York, USA', region: 'US', state: 'New York' },
  // Massachusetts
  { text: 'Boston, Massachusetts, USA', region: 'US', state: 'Massachusetts' },
  { text: 'Cambridge, Massachusetts, USA', region: 'US', state: 'Massachusetts' },
  { text: 'Worcester, Massachusetts, USA', region: 'US', state: 'Massachusetts' },
  // DC / Virginia / Maryland
  { text: 'Washington, District of Columbia, USA', region: 'US', state: 'District of Columbia' },
  { text: 'Arlington, Virginia, USA', region: 'US', state: 'Virginia' },
  { text: 'Richmond, Virginia, USA', region: 'US', state: 'Virginia' },
  { text: 'Virginia Beach, Virginia, USA', region: 'US', state: 'Virginia' },
  { text: 'Baltimore, Maryland, USA', region: 'US', state: 'Maryland' },
  { text: 'Bethesda, Maryland, USA', region: 'US', state: 'Maryland' },
  // Georgia
  { text: 'Atlanta, Georgia, USA', region: 'US', state: 'Georgia' },
  { text: 'Savannah, Georgia, USA', region: 'US', state: 'Georgia' },
  // Florida
  { text: 'Miami, Florida, USA', region: 'US', state: 'Florida' },
  { text: 'Orlando, Florida, USA', region: 'US', state: 'Florida' },
  { text: 'Tampa, Florida, USA', region: 'US', state: 'Florida' },
  { text: 'Jacksonville, Florida, USA', region: 'US', state: 'Florida' },
  { text: 'Fort Lauderdale, Florida, USA', region: 'US', state: 'Florida' },
  { text: 'St. Petersburg, Florida, USA', region: 'US', state: 'Florida' },
  // North Carolina
  { text: 'Charlotte, North Carolina, USA', region: 'US', state: 'North Carolina' },
  { text: 'Raleigh, North Carolina, USA', region: 'US', state: 'North Carolina' },
  { text: 'Durham, North Carolina, USA', region: 'US', state: 'North Carolina' },
  // Tennessee
  { text: 'Nashville, Tennessee, USA', region: 'US', state: 'Tennessee' },
  { text: 'Memphis, Tennessee, USA', region: 'US', state: 'Tennessee' },
  { text: 'Knoxville, Tennessee, USA', region: 'US', state: 'Tennessee' },
  // Minnesota
  { text: 'Minneapolis, Minnesota, USA', region: 'US', state: 'Minnesota' },
  { text: 'St. Paul, Minnesota, USA', region: 'US', state: 'Minnesota' },
  // Michigan
  { text: 'Detroit, Michigan, USA', region: 'US', state: 'Michigan' },
  { text: 'Ann Arbor, Michigan, USA', region: 'US', state: 'Michigan' },
  { text: 'Grand Rapids, Michigan, USA', region: 'US', state: 'Michigan' },
  // Pennsylvania
  { text: 'Philadelphia, Pennsylvania, USA', region: 'US', state: 'Pennsylvania' },
  { text: 'Pittsburgh, Pennsylvania, USA', region: 'US', state: 'Pennsylvania' },
  // Indiana
  { text: 'Indianapolis, Indiana, USA', region: 'US', state: 'Indiana' },
  // Ohio
  { text: 'Columbus, Ohio, USA', region: 'US', state: 'Ohio' },
  { text: 'Cleveland, Ohio, USA', region: 'US', state: 'Ohio' },
  { text: 'Cincinnati, Ohio, USA', region: 'US', state: 'Ohio' },
  // Utah
  { text: 'Salt Lake City, Utah, USA', region: 'US', state: 'Utah' },
  { text: 'Provo, Utah, USA', region: 'US', state: 'Utah' },
  // Nevada
  { text: 'Las Vegas, Nevada, USA', region: 'US', state: 'Nevada' },
  { text: 'Reno, Nevada, USA', region: 'US', state: 'Nevada' },
  // Missouri
  { text: 'Kansas City, Missouri, USA', region: 'US', state: 'Missouri' },
  { text: 'St. Louis, Missouri, USA', region: 'US', state: 'Missouri' },
  // Wisconsin
  { text: 'Milwaukee, Wisconsin, USA', region: 'US', state: 'Wisconsin' },
  { text: 'Madison, Wisconsin, USA', region: 'US', state: 'Wisconsin' },
  // Idaho
  { text: 'Boise, Idaho, USA', region: 'US', state: 'Idaho' },
  // New Mexico
  { text: 'Albuquerque, New Mexico, USA', region: 'US', state: 'New Mexico' },
  { text: 'Santa Fe, New Mexico, USA', region: 'US', state: 'New Mexico' },
  // Connecticut
  { text: 'Hartford, Connecticut, USA', region: 'US', state: 'Connecticut' },
  { text: 'Stamford, Connecticut, USA', region: 'US', state: 'Connecticut' },
  { text: 'New Haven, Connecticut, USA', region: 'US', state: 'Connecticut' },
  // New Jersey
  { text: 'Newark, New Jersey, USA', region: 'US', state: 'New Jersey' },
  { text: 'Jersey City, New Jersey, USA', region: 'US', state: 'New Jersey' },
  { text: 'Princeton, New Jersey, USA', region: 'US', state: 'New Jersey' },
  // Other states
  { text: 'Omaha, Nebraska, USA', region: 'US', state: 'Nebraska' },
  { text: 'Des Moines, Iowa, USA', region: 'US', state: 'Iowa' },
  { text: 'Honolulu, Hawaii, USA', region: 'US', state: 'Hawaii' },
  { text: 'Anchorage, Alaska, USA', region: 'US', state: 'Alaska' },
  { text: 'Charleston, South Carolina, USA', region: 'US', state: 'South Carolina' },
  { text: 'Columbia, South Carolina, USA', region: 'US', state: 'South Carolina' },
  { text: 'Louisville, Kentucky, USA', region: 'US', state: 'Kentucky' },
  { text: 'Lexington, Kentucky, USA', region: 'US', state: 'Kentucky' },
  { text: 'Oklahoma City, Oklahoma, USA', region: 'US', state: 'Oklahoma' },
  { text: 'Tulsa, Oklahoma, USA', region: 'US', state: 'Oklahoma' },
  { text: 'Providence, Rhode Island, USA', region: 'US', state: 'Rhode Island' },
  { text: 'New Orleans, Louisiana, USA', region: 'US', state: 'Louisiana' },
  { text: 'Little Rock, Arkansas, USA', region: 'US', state: 'Arkansas' },
  { text: 'Birmingham, Alabama, USA', region: 'US', state: 'Alabama' },
  { text: 'Wichita, Kansas, USA', region: 'US', state: 'Kansas' },
  { text: 'Chattanooga, Tennessee, USA', region: 'US', state: 'Tennessee' },
  { text: 'Baton Rouge, Louisiana, USA', region: 'US', state: 'Louisiana' },
  { text: 'Wilmington, Delaware, USA', region: 'US', state: 'Delaware' },
  { text: 'Bridgeport, Connecticut, USA', region: 'US', state: 'Connecticut' },
  { text: 'Greenville, South Carolina, USA', region: 'US', state: 'South Carolina' },
  { text: 'Norfolk, Virginia, USA', region: 'US', state: 'Virginia' },
  { text: 'Tacoma, Washington, USA', region: 'US', state: 'Washington' },
  { text: 'Fresno, California, USA', region: 'US', state: 'California' },
  { text: 'Bakersfield, California, USA', region: 'US', state: 'California' },
  { text: 'Anaheim, California, USA', region: 'US', state: 'California' },
  { text: 'Aurora, Colorado, USA', region: 'US', state: 'Colorado' },
  { text: 'Mesa, Arizona, USA', region: 'US', state: 'Arizona' },
  { text: 'Chandler, Arizona, USA', region: 'US', state: 'Arizona' },
  { text: 'Henderson, Nevada, USA', region: 'US', state: 'Nevada' },

  // ============================================================
  // United Kingdom (GB) — ~36 cities
  // ============================================================
  { text: 'London, England, UK', region: 'GB', state: 'England' },
  { text: 'Manchester, England, UK', region: 'GB', state: 'England' },
  { text: 'Birmingham, England, UK', region: 'GB', state: 'England' },
  { text: 'Edinburgh, Scotland, UK', region: 'GB', state: 'Scotland' },
  { text: 'Glasgow, Scotland, UK', region: 'GB', state: 'Scotland' },
  { text: 'Bristol, England, UK', region: 'GB', state: 'England' },
  { text: 'Leeds, England, UK', region: 'GB', state: 'England' },
  { text: 'Liverpool, England, UK', region: 'GB', state: 'England' },
  { text: 'Cambridge, England, UK', region: 'GB', state: 'England' },
  { text: 'Oxford, England, UK', region: 'GB', state: 'England' },
  { text: 'Brighton, England, UK', region: 'GB', state: 'England' },
  { text: 'Cardiff, Wales, UK', region: 'GB', state: 'Wales' },
  { text: 'Belfast, Northern Ireland, UK', region: 'GB', state: 'Northern Ireland' },
  { text: 'Nottingham, England, UK', region: 'GB', state: 'England' },
  { text: 'Sheffield, England, UK', region: 'GB', state: 'England' },
  { text: 'Newcastle, England, UK', region: 'GB', state: 'England' },
  { text: 'Southampton, England, UK', region: 'GB', state: 'England' },
  { text: 'Reading, England, UK', region: 'GB', state: 'England' },
  { text: 'Milton Keynes, England, UK', region: 'GB', state: 'England' },
  { text: 'Coventry, England, UK', region: 'GB', state: 'England' },
  { text: 'Leicester, England, UK', region: 'GB', state: 'England' },
  { text: 'Aberdeen, Scotland, UK', region: 'GB', state: 'Scotland' },
  { text: 'Dundee, Scotland, UK', region: 'GB', state: 'Scotland' },
  { text: 'Bath, England, UK', region: 'GB', state: 'England' },
  { text: 'York, England, UK', region: 'GB', state: 'England' },
  { text: 'Exeter, England, UK', region: 'GB', state: 'England' },
  { text: 'Norwich, England, UK', region: 'GB', state: 'England' },
  { text: 'Plymouth, England, UK', region: 'GB', state: 'England' },
  { text: 'Swindon, England, UK', region: 'GB', state: 'England' },
  { text: 'Derby, England, UK', region: 'GB', state: 'England' },
  { text: 'Swansea, Wales, UK', region: 'GB', state: 'Wales' },
  { text: 'Wolverhampton, England, UK', region: 'GB', state: 'England' },
  { text: 'Stoke-on-Trent, England, UK', region: 'GB', state: 'England' },
  { text: 'Cheltenham, England, UK', region: 'GB', state: 'England' },
  { text: 'Guildford, England, UK', region: 'GB', state: 'England' },
  { text: 'Stirling, Scotland, UK', region: 'GB', state: 'Scotland' },

  // ============================================================
  // Canada (CA) — ~25 cities
  // ============================================================
  { text: 'Toronto, Ontario, Canada', region: 'CA', state: 'Ontario' },
  { text: 'Vancouver, British Columbia, Canada', region: 'CA', state: 'British Columbia' },
  { text: 'Montreal, Quebec, Canada', region: 'CA', state: 'Quebec' },
  { text: 'Ottawa, Ontario, Canada', region: 'CA', state: 'Ontario' },
  { text: 'Calgary, Alberta, Canada', region: 'CA', state: 'Alberta' },
  { text: 'Edmonton, Alberta, Canada', region: 'CA', state: 'Alberta' },
  { text: 'Winnipeg, Manitoba, Canada', region: 'CA', state: 'Manitoba' },
  { text: 'Quebec City, Quebec, Canada', region: 'CA', state: 'Quebec' },
  { text: 'Halifax, Nova Scotia, Canada', region: 'CA', state: 'Nova Scotia' },
  { text: 'Victoria, British Columbia, Canada', region: 'CA', state: 'British Columbia' },
  { text: 'Waterloo, Ontario, Canada', region: 'CA', state: 'Ontario' },
  { text: 'Kitchener, Ontario, Canada', region: 'CA', state: 'Ontario' },
  { text: 'Mississauga, Ontario, Canada', region: 'CA', state: 'Ontario' },
  { text: 'Brampton, Ontario, Canada', region: 'CA', state: 'Ontario' },
  { text: 'Hamilton, Ontario, Canada', region: 'CA', state: 'Ontario' },
  { text: 'London, Ontario, Canada', region: 'CA', state: 'Ontario' },
  { text: 'Surrey, British Columbia, Canada', region: 'CA', state: 'British Columbia' },
  { text: 'Burnaby, British Columbia, Canada', region: 'CA', state: 'British Columbia' },
  { text: 'Richmond, British Columbia, Canada', region: 'CA', state: 'British Columbia' },
  { text: 'Markham, Ontario, Canada', region: 'CA', state: 'Ontario' },
  { text: 'Saskatoon, Saskatchewan, Canada', region: 'CA', state: 'Saskatchewan' },
  { text: 'Regina, Saskatchewan, Canada', region: 'CA', state: 'Saskatchewan' },
  { text: "St. John's, Newfoundland, Canada", region: 'CA', state: 'Newfoundland' },
  { text: 'Kelowna, British Columbia, Canada', region: 'CA', state: 'British Columbia' },
  { text: 'Guelph, Ontario, Canada', region: 'CA', state: 'Ontario' },
  { text: 'Windsor, Ontario, Canada', region: 'CA', state: 'Ontario' },
  { text: 'Oshawa, Ontario, Canada', region: 'CA', state: 'Ontario' },
  { text: 'Sherbrooke, Quebec, Canada', region: 'CA', state: 'Quebec' },
  { text: 'Fredericton, New Brunswick, Canada', region: 'CA', state: 'New Brunswick' },
  { text: 'Moncton, New Brunswick, Canada', region: 'CA', state: 'New Brunswick' },

  // ============================================================
  // Germany (DE) — ~25 cities
  // ============================================================
  { text: 'Berlin, Germany', region: 'DE' },
  { text: 'Munich, Germany', region: 'DE' },
  { text: 'Hamburg, Germany', region: 'DE' },
  { text: 'Frankfurt, Germany', region: 'DE' },
  { text: 'Cologne, Germany', region: 'DE' },
  { text: 'Stuttgart, Germany', region: 'DE' },
  { text: 'Düsseldorf, Germany', region: 'DE' },
  { text: 'Dortmund, Germany', region: 'DE' },
  { text: 'Essen, Germany', region: 'DE' },
  { text: 'Leipzig, Germany', region: 'DE' },
  { text: 'Bremen, Germany', region: 'DE' },
  { text: 'Dresden, Germany', region: 'DE' },
  { text: 'Hanover, Germany', region: 'DE' },
  { text: 'Nuremberg, Germany', region: 'DE' },
  { text: 'Bonn, Germany', region: 'DE' },
  { text: 'Mannheim, Germany', region: 'DE' },
  { text: 'Karlsruhe, Germany', region: 'DE' },
  { text: 'Augsburg, Germany', region: 'DE' },
  { text: 'Aachen, Germany', region: 'DE' },
  { text: 'Heidelberg, Germany', region: 'DE' },
  { text: 'Wiesbaden, Germany', region: 'DE' },
  { text: 'Freiburg, Germany', region: 'DE' },
  { text: 'Münster, Germany', region: 'DE' },
  { text: 'Bielefeld, Germany', region: 'DE' },
  { text: 'Regensburg, Germany', region: 'DE' },

  // ============================================================
  // Australia (AU) — ~20 cities
  // ============================================================
  { text: 'Sydney, New South Wales, Australia', region: 'AU', state: 'New South Wales' },
  { text: 'Melbourne, Victoria, Australia', region: 'AU', state: 'Victoria' },
  { text: 'Brisbane, Queensland, Australia', region: 'AU', state: 'Queensland' },
  { text: 'Perth, Western Australia, Australia', region: 'AU', state: 'Western Australia' },
  { text: 'Adelaide, South Australia, Australia', region: 'AU', state: 'South Australia' },
  {
    text: 'Canberra, Australian Capital Territory, Australia',
    region: 'AU',
    state: 'Australian Capital Territory',
  },
  { text: 'Gold Coast, Queensland, Australia', region: 'AU', state: 'Queensland' },
  { text: 'Hobart, Tasmania, Australia', region: 'AU', state: 'Tasmania' },
  { text: 'Darwin, Northern Territory, Australia', region: 'AU', state: 'Northern Territory' },
  { text: 'Newcastle, New South Wales, Australia', region: 'AU', state: 'New South Wales' },
  { text: 'Wollongong, New South Wales, Australia', region: 'AU', state: 'New South Wales' },
  { text: 'Geelong, Victoria, Australia', region: 'AU', state: 'Victoria' },
  { text: 'Cairns, Queensland, Australia', region: 'AU', state: 'Queensland' },
  { text: 'Townsville, Queensland, Australia', region: 'AU', state: 'Queensland' },
  { text: 'Sunshine Coast, Queensland, Australia', region: 'AU', state: 'Queensland' },
  { text: 'Toowoomba, Queensland, Australia', region: 'AU', state: 'Queensland' },
  { text: 'Ballarat, Victoria, Australia', region: 'AU', state: 'Victoria' },
  { text: 'Bendigo, Victoria, Australia', region: 'AU', state: 'Victoria' },
  { text: 'Launceston, Tasmania, Australia', region: 'AU', state: 'Tasmania' },
  { text: 'Parramatta, New South Wales, Australia', region: 'AU', state: 'New South Wales' },

  // ============================================================
  // Singapore (SG)
  // ============================================================
  { text: 'Singapore, Singapore', region: 'SG' },

  // ============================================================
  // UAE (AE) — ~10 cities
  // ============================================================
  { text: 'Dubai, UAE', region: 'AE' },
  { text: 'Abu Dhabi, UAE', region: 'AE' },
  { text: 'Sharjah, UAE', region: 'AE' },
  { text: 'Ajman, UAE', region: 'AE' },
  { text: 'Al Ain, UAE', region: 'AE' },
  { text: 'Ras Al Khaimah, UAE', region: 'AE' },
  { text: 'Fujairah, UAE', region: 'AE' },
  { text: 'Umm Al Quwain, UAE', region: 'AE' },
  { text: 'Dubai Internet City, UAE', region: 'AE' },
  { text: 'Dubai Media City, UAE', region: 'AE' },

  // ============================================================
  // Japan (JP) — ~15 cities
  // ============================================================
  { text: 'Tokyo, Japan', region: 'JP' },
  { text: 'Osaka, Japan', region: 'JP' },
  { text: 'Yokohama, Japan', region: 'JP' },
  { text: 'Nagoya, Japan', region: 'JP' },
  { text: 'Sapporo, Japan', region: 'JP' },
  { text: 'Fukuoka, Japan', region: 'JP' },
  { text: 'Kobe, Japan', region: 'JP' },
  { text: 'Kyoto, Japan', region: 'JP' },
  { text: 'Sendai, Japan', region: 'JP' },
  { text: 'Kawasaki, Japan', region: 'JP' },
  { text: 'Hiroshima, Japan', region: 'JP' },
  { text: 'Kitakyushu, Japan', region: 'JP' },
  { text: 'Chiba, Japan', region: 'JP' },
  { text: 'Sakai, Japan', region: 'JP' },
  { text: 'Niigata, Japan', region: 'JP' },

  // ============================================================
  // South Korea (KR) — ~8 cities
  // ============================================================
  { text: 'Seoul, South Korea', region: 'KR' },
  { text: 'Busan, South Korea', region: 'KR' },
  { text: 'Incheon, South Korea', region: 'KR' },
  { text: 'Daegu, South Korea', region: 'KR' },
  { text: 'Daejeon, South Korea', region: 'KR' },
  { text: 'Gwangju, South Korea', region: 'KR' },
  { text: 'Suwon, South Korea', region: 'KR' },
  { text: 'Seongnam, South Korea', region: 'KR' },

  // ============================================================
  // China (CN) — ~18 cities
  // ============================================================
  { text: 'Beijing, China', region: 'CN' },
  { text: 'Shanghai, China', region: 'CN' },
  { text: 'Shenzhen, China', region: 'CN' },
  { text: 'Guangzhou, China', region: 'CN' },
  { text: 'Hangzhou, China', region: 'CN' },
  { text: 'Chengdu, China', region: 'CN' },
  { text: 'Wuhan, China', region: 'CN' },
  { text: 'Nanjing, China', region: 'CN' },
  { text: 'Suzhou, China', region: 'CN' },
  { text: "Xi'an, China", region: 'CN' },
  { text: 'Tianjin, China', region: 'CN' },
  { text: 'Qingdao, China', region: 'CN' },
  { text: 'Dalian, China', region: 'CN' },
  { text: 'Xiamen, China', region: 'CN' },
  { text: 'Zhengzhou, China', region: 'CN' },
  { text: 'Changsha, China', region: 'CN' },
  { text: 'Hefei, China', region: 'CN' },
  { text: 'Kunming, China', region: 'CN' },

  // ============================================================
  // France (FR) — ~12 cities
  // ============================================================
  { text: 'Paris, France', region: 'FR' },
  { text: 'Lyon, France', region: 'FR' },
  { text: 'Marseille, France', region: 'FR' },
  { text: 'Toulouse, France', region: 'FR' },
  { text: 'Nice, France', region: 'FR' },
  { text: 'Nantes, France', region: 'FR' },
  { text: 'Strasbourg, France', region: 'FR' },
  { text: 'Montpellier, France', region: 'FR' },
  { text: 'Bordeaux, France', region: 'FR' },
  { text: 'Lille, France', region: 'FR' },
  { text: 'Rennes, France', region: 'FR' },
  { text: 'Grenoble, France', region: 'FR' },

  // ============================================================
  // Netherlands (NL) — ~10 cities
  // ============================================================
  { text: 'Amsterdam, Netherlands', region: 'NL' },
  { text: 'Rotterdam, Netherlands', region: 'NL' },
  { text: 'The Hague, Netherlands', region: 'NL' },
  { text: 'Utrecht, Netherlands', region: 'NL' },
  { text: 'Eindhoven, Netherlands', region: 'NL' },
  { text: 'Groningen, Netherlands', region: 'NL' },
  { text: 'Tilburg, Netherlands', region: 'NL' },
  { text: 'Breda, Netherlands', region: 'NL' },
  { text: 'Delft, Netherlands', region: 'NL' },
  { text: 'Leiden, Netherlands', region: 'NL' },

  // ============================================================
  // Ireland (IE) — ~6 cities
  // ============================================================
  { text: 'Dublin, Ireland', region: 'IE' },
  { text: 'Cork, Ireland', region: 'IE' },
  { text: 'Galway, Ireland', region: 'IE' },
  { text: 'Limerick, Ireland', region: 'IE' },
  { text: 'Waterford, Ireland', region: 'IE' },
  { text: 'Kilkenny, Ireland', region: 'IE' },

  // ============================================================
  // Israel (IL) — ~8 cities
  // ============================================================
  { text: 'Tel Aviv, Israel', region: 'IL' },
  { text: 'Jerusalem, Israel', region: 'IL' },
  { text: 'Haifa, Israel', region: 'IL' },
  { text: 'Herzliya, Israel', region: 'IL' },
  { text: "Ra'anana, Israel", region: 'IL' },
  { text: "Be'er Sheva, Israel", region: 'IL' },
  { text: 'Petah Tikva, Israel', region: 'IL' },
  { text: 'Netanya, Israel', region: 'IL' },
  { text: 'Rehovot, Israel', region: 'IL' },
  { text: 'Rishon LeZion, Israel', region: 'IL' },

  // ============================================================
  // Brazil (BR) — ~12 cities
  // ============================================================
  { text: 'São Paulo, Brazil', region: 'BR' },
  { text: 'Rio de Janeiro, Brazil', region: 'BR' },
  { text: 'Belo Horizonte, Brazil', region: 'BR' },
  { text: 'Brasília, Brazil', region: 'BR' },
  { text: 'Curitiba, Brazil', region: 'BR' },
  { text: 'Porto Alegre, Brazil', region: 'BR' },
  { text: 'Recife, Brazil', region: 'BR' },
  { text: 'Salvador, Brazil', region: 'BR' },
  { text: 'Fortaleza, Brazil', region: 'BR' },
  { text: 'Campinas, Brazil', region: 'BR' },
  { text: 'Florianópolis, Brazil', region: 'BR' },
  { text: 'Goiânia, Brazil', region: 'BR' },
  { text: 'Manaus, Brazil', region: 'BR' },
  { text: 'Vitória, Brazil', region: 'BR' },

  // ============================================================
  // Mexico (MX) — ~8 cities
  // ============================================================
  { text: 'Mexico City, Mexico', region: 'MX' },
  { text: 'Guadalajara, Mexico', region: 'MX' },
  { text: 'Monterrey, Mexico', region: 'MX' },
  { text: 'Puebla, Mexico', region: 'MX' },
  { text: 'Querétaro, Mexico', region: 'MX' },
  { text: 'Tijuana, Mexico', region: 'MX' },
  { text: 'Mérida, Mexico', region: 'MX' },
  { text: 'Cancún, Mexico', region: 'MX' },
  { text: 'León, Mexico', region: 'MX' },
  { text: 'Toluca, Mexico', region: 'MX' },

  // ============================================================
  // Poland (PL) — ~8 cities
  // ============================================================
  { text: 'Warsaw, Poland', region: 'PL' },
  { text: 'Kraków, Poland', region: 'PL' },
  { text: 'Wrocław, Poland', region: 'PL' },
  { text: 'Gdańsk, Poland', region: 'PL' },
  { text: 'Poznań, Poland', region: 'PL' },
  { text: 'Łódź, Poland', region: 'PL' },
  { text: 'Katowice, Poland', region: 'PL' },
  { text: 'Lublin, Poland', region: 'PL' },
  { text: 'Szczecin, Poland', region: 'PL' },
  { text: 'Bydgoszcz, Poland', region: 'PL' },

  // ============================================================
  // Sweden (SE) — ~6 cities
  // ============================================================
  { text: 'Stockholm, Sweden', region: 'SE' },
  { text: 'Gothenburg, Sweden', region: 'SE' },
  { text: 'Malmö, Sweden', region: 'SE' },
  { text: 'Uppsala, Sweden', region: 'SE' },
  { text: 'Linköping, Sweden', region: 'SE' },
  { text: 'Lund, Sweden', region: 'SE' },

  // ============================================================
  // Switzerland (CH) — ~6 cities
  // ============================================================
  { text: 'Zurich, Switzerland', region: 'CH' },
  { text: 'Geneva, Switzerland', region: 'CH' },
  { text: 'Basel, Switzerland', region: 'CH' },
  { text: 'Bern, Switzerland', region: 'CH' },
  { text: 'Lausanne, Switzerland', region: 'CH' },
  { text: 'Lucerne, Switzerland', region: 'CH' },

  // ============================================================
  // Italy (IT) — ~10 cities
  // ============================================================
  { text: 'Milan, Italy', region: 'IT' },
  { text: 'Rome, Italy', region: 'IT' },
  { text: 'Turin, Italy', region: 'IT' },
  { text: 'Florence, Italy', region: 'IT' },
  { text: 'Bologna, Italy', region: 'IT' },
  { text: 'Naples, Italy', region: 'IT' },
  { text: 'Genoa, Italy', region: 'IT' },
  { text: 'Venice, Italy', region: 'IT' },
  { text: 'Padua, Italy', region: 'IT' },
  { text: 'Palermo, Italy', region: 'IT' },
  { text: 'Bari, Italy', region: 'IT' },
  { text: 'Catania, Italy', region: 'IT' },
  { text: 'Verona, Italy', region: 'IT' },

  // ============================================================
  // Spain (ES) — ~10 cities
  // ============================================================
  { text: 'Madrid, Spain', region: 'ES' },
  { text: 'Barcelona, Spain', region: 'ES' },
  { text: 'Valencia, Spain', region: 'ES' },
  { text: 'Seville, Spain', region: 'ES' },
  { text: 'Bilbao, Spain', region: 'ES' },
  { text: 'Malaga, Spain', region: 'ES' },
  { text: 'Zaragoza, Spain', region: 'ES' },
  { text: 'Palma de Mallorca, Spain', region: 'ES' },
  { text: 'Granada, Spain', region: 'ES' },
  { text: 'Las Palmas, Spain', region: 'ES' },
  { text: 'Murcia, Spain', region: 'ES' },
  { text: 'Alicante, Spain', region: 'ES' },

  // ============================================================
  // Portugal (PT) — ~5 cities
  // ============================================================
  { text: 'Lisbon, Portugal', region: 'PT' },
  { text: 'Porto, Portugal', region: 'PT' },
  { text: 'Braga, Portugal', region: 'PT' },
  { text: 'Coimbra, Portugal', region: 'PT' },
  { text: 'Funchal, Portugal', region: 'PT' },

  // ============================================================
  // Czech Republic (CZ) — ~4 cities
  // ============================================================
  { text: 'Prague, Czech Republic', region: 'CZ' },
  { text: 'Brno, Czech Republic', region: 'CZ' },
  { text: 'Ostrava, Czech Republic', region: 'CZ' },
  { text: 'Plzeň, Czech Republic', region: 'CZ' },

  // ============================================================
  // India (IN) — Special entries only (main cities come from indian-cities.ts)
  // ============================================================
  { text: 'Remote, India', region: 'IN' },
  { text: 'Work From Home, India', region: 'IN' },
  { text: 'Hybrid, India', region: 'IN' },
  { text: 'Pan India', region: 'IN' },

  // ============================================================
  // Vietnam (VN) — ~6 cities
  // ============================================================
  { text: 'Ho Chi Minh City, Vietnam', region: 'VN' },
  { text: 'Hanoi, Vietnam', region: 'VN' },
  { text: 'Da Nang, Vietnam', region: 'VN' },
  { text: 'Hai Phong, Vietnam', region: 'VN' },
  { text: 'Can Tho, Vietnam', region: 'VN' },
  { text: 'Nha Trang, Vietnam', region: 'VN' },
  { text: 'Hue, Vietnam', region: 'VN' },

  // ============================================================
  // Philippines (PH) — ~6 cities
  // ============================================================
  { text: 'Manila, Philippines', region: 'PH' },
  { text: 'Cebu City, Philippines', region: 'PH' },
  { text: 'Davao, Philippines', region: 'PH' },
  { text: 'Quezon City, Philippines', region: 'PH' },
  { text: 'Makati, Philippines', region: 'PH' },
  { text: 'Taguig, Philippines', region: 'PH' },

  // ============================================================
  // Thailand (TH) — ~4 cities
  // ============================================================
  { text: 'Bangkok, Thailand', region: 'TH' },
  { text: 'Chiang Mai, Thailand', region: 'TH' },
  { text: 'Phuket, Thailand', region: 'TH' },
  { text: 'Pattaya, Thailand', region: 'TH' },

  // ============================================================
  // Indonesia (ID) — ~6 cities
  // ============================================================
  { text: 'Jakarta, Indonesia', region: 'ID' },
  { text: 'Surabaya, Indonesia', region: 'ID' },
  { text: 'Bandung, Indonesia', region: 'ID' },
  { text: 'Medan, Indonesia', region: 'ID' },
  { text: 'Semarang, Indonesia', region: 'ID' },
  { text: 'Yogyakarta, Indonesia', region: 'ID' },

  // ============================================================
  // Malaysia (MY) — ~6 cities
  // ============================================================
  { text: 'Kuala Lumpur, Malaysia', region: 'MY' },
  { text: 'Penang, Malaysia', region: 'MY' },
  { text: 'Johor Bahru, Malaysia', region: 'MY' },
  { text: 'Malacca, Malaysia', region: 'MY' },
  { text: 'Cyberjaya, Malaysia', region: 'MY' },
  { text: 'Petaling Jaya, Malaysia', region: 'MY' },

  // ============================================================
  // East Asia
  // ============================================================
  { text: 'Taipei, Taiwan', region: 'TW' },
  { text: 'Hsinchu, Taiwan', region: 'TW' },
  { text: 'Taichung, Taiwan', region: 'TW' },
  { text: 'Kaohsiung, Taiwan', region: 'TW' },
  { text: 'Hong Kong', region: 'HK' },

  // ============================================================
  // South Asia — Pakistan (PK) — ~5 cities
  // ============================================================
  { text: 'Karachi, Pakistan', region: 'PK' },
  { text: 'Lahore, Pakistan', region: 'PK' },
  { text: 'Islamabad, Pakistan', region: 'PK' },
  { text: 'Faisalabad, Pakistan', region: 'PK' },
  { text: 'Rawalpindi, Pakistan', region: 'PK' },
  { text: 'Multan, Pakistan', region: 'PK' },
  { text: 'Peshawar, Pakistan', region: 'PK' },

  // ============================================================
  // South Asia — Bangladesh (BD) — ~4 cities
  // ============================================================
  { text: 'Dhaka, Bangladesh', region: 'BD' },
  { text: 'Chittagong, Bangladesh', region: 'BD' },
  { text: 'Sylhet, Bangladesh', region: 'BD' },
  { text: 'Rajshahi, Bangladesh', region: 'BD' },

  // ============================================================
  // South Asia — Sri Lanka (LK) — ~4 cities
  // ============================================================
  { text: 'Colombo, Sri Lanka', region: 'LK' },
  { text: 'Kandy, Sri Lanka', region: 'LK' },
  { text: 'Galle, Sri Lanka', region: 'LK' },
  { text: 'Jaffna, Sri Lanka', region: 'LK' },

  // ============================================================
  // South Asia — Nepal (NP) — ~3 cities
  // ============================================================
  { text: 'Kathmandu, Nepal', region: 'NP' },
  { text: 'Pokhara, Nepal', region: 'NP' },
  { text: 'Lalitpur, Nepal', region: 'NP' },

  // ============================================================
  // Middle East (non-UAE)
  // ============================================================
  { text: 'Riyadh, Saudi Arabia', region: 'SA' },
  { text: 'Jeddah, Saudi Arabia', region: 'SA' },
  { text: 'Dammam, Saudi Arabia', region: 'SA' },
  { text: 'Mecca, Saudi Arabia', region: 'SA' },
  { text: 'Doha, Qatar', region: 'QA' },
  { text: 'Kuwait City, Kuwait', region: 'KW' },
  { text: 'Muscat, Oman', region: 'OM' },
  { text: 'Manama, Bahrain', region: 'BH' },

  // ============================================================
  // Turkey (TR) — ~6 cities
  // ============================================================
  { text: 'Istanbul, Turkey', region: 'TR' },
  { text: 'Ankara, Turkey', region: 'TR' },
  { text: 'Izmir, Turkey', region: 'TR' },
  { text: 'Bursa, Turkey', region: 'TR' },
  { text: 'Antalya, Turkey', region: 'TR' },
  { text: 'Gaziantep, Turkey', region: 'TR' },

  // ============================================================
  // Africa — Nigeria (NG) — ~5 cities
  // ============================================================
  { text: 'Lagos, Nigeria', region: 'NG' },
  { text: 'Abuja, Nigeria', region: 'NG' },
  { text: 'Port Harcourt, Nigeria', region: 'NG' },
  { text: 'Kano, Nigeria', region: 'NG' },
  { text: 'Ibadan, Nigeria', region: 'NG' },

  // ============================================================
  // Africa — Kenya (KE) — ~4 cities
  // ============================================================
  { text: 'Nairobi, Kenya', region: 'KE' },
  { text: 'Mombasa, Kenya', region: 'KE' },
  { text: 'Kisumu, Kenya', region: 'KE' },
  { text: 'Nakuru, Kenya', region: 'KE' },

  // ============================================================
  // Africa — South Africa (ZA) — ~6 cities
  // ============================================================
  { text: 'Johannesburg, South Africa', region: 'ZA' },
  { text: 'Cape Town, South Africa', region: 'ZA' },
  { text: 'Durban, South Africa', region: 'ZA' },
  { text: 'Pretoria, South Africa', region: 'ZA' },
  { text: 'Port Elizabeth, South Africa', region: 'ZA' },
  { text: 'Sandton, South Africa', region: 'ZA' },

  // ============================================================
  // Africa — Egypt (EG) — ~4 cities
  // ============================================================
  { text: 'Cairo, Egypt', region: 'EG' },
  { text: 'Alexandria, Egypt', region: 'EG' },
  { text: 'Giza, Egypt', region: 'EG' },
  { text: 'Sharm El Sheikh, Egypt', region: 'EG' },
  { text: 'Luxor, Egypt', region: 'EG' },

  // ============================================================
  // Africa — Other
  // ============================================================
  { text: 'Accra, Ghana', region: 'GH' },
  { text: 'Addis Ababa, Ethiopia', region: 'ET' },
  { text: 'Dar es Salaam, Tanzania', region: 'TZ' },
  { text: 'Kigali, Rwanda', region: 'RW' },
  { text: 'Casablanca, Morocco', region: 'MA' },
  { text: 'Tunis, Tunisia', region: 'TN' },
  { text: 'Kampala, Uganda', region: 'UG' },
  { text: 'Lusaka, Zambia', region: 'ZM' },
  { text: 'Harare, Zimbabwe', region: 'ZW' },
  { text: 'Maputo, Mozambique', region: 'MZ' },
  { text: 'Dakar, Senegal', region: 'SN' },
  { text: 'Abidjan, Ivory Coast', region: 'CI' },

  // ============================================================
  // South America — Colombia (CO) — ~4 cities
  // ============================================================
  { text: 'Bogotá, Colombia', region: 'CO' },
  { text: 'Medellín, Colombia', region: 'CO' },
  { text: 'Cali, Colombia', region: 'CO' },
  { text: 'Barranquilla, Colombia', region: 'CO' },

  // ============================================================
  // South America — Argentina (AR) — ~4 cities
  // ============================================================
  { text: 'Buenos Aires, Argentina', region: 'AR' },
  { text: 'Córdoba, Argentina', region: 'AR' },
  { text: 'Rosario, Argentina', region: 'AR' },
  { text: 'Mendoza, Argentina', region: 'AR' },

  // ============================================================
  // South America — Chile (CL) — ~3 cities
  // ============================================================
  { text: 'Santiago, Chile', region: 'CL' },
  { text: 'Valparaíso, Chile', region: 'CL' },
  { text: 'Concepción, Chile', region: 'CL' },

  // ============================================================
  // South America — Peru (PE) — ~3 cities
  // ============================================================
  { text: 'Lima, Peru', region: 'PE' },
  { text: 'Arequipa, Peru', region: 'PE' },
  { text: 'Cusco, Peru', region: 'PE' },

  // ============================================================
  // South America — Other
  // ============================================================
  { text: 'Montevideo, Uruguay', region: 'UY' },
  { text: 'Quito, Ecuador', region: 'EC' },
  { text: 'Guayaquil, Ecuador', region: 'EC' },
  { text: 'Caracas, Venezuela', region: 'VE' },
  { text: 'Asunción, Paraguay', region: 'PY' },
  { text: 'La Paz, Bolivia', region: 'BO' },
  { text: 'Panama City, Panama', region: 'PA' },
  { text: 'San José, Costa Rica', region: 'CR' },

  // ============================================================
  // Hungary (HU) — ~3 cities
  // ============================================================
  { text: 'Budapest, Hungary', region: 'HU' },
  { text: 'Debrecen, Hungary', region: 'HU' },
  { text: 'Szeged, Hungary', region: 'HU' },

  // ============================================================
  // Austria (AT) — ~4 cities
  // ============================================================
  { text: 'Vienna, Austria', region: 'AT' },
  { text: 'Graz, Austria', region: 'AT' },
  { text: 'Linz, Austria', region: 'AT' },
  { text: 'Salzburg, Austria', region: 'AT' },

  // ============================================================
  // Belgium (BE) — ~4 cities
  // ============================================================
  { text: 'Brussels, Belgium', region: 'BE' },
  { text: 'Antwerp, Belgium', region: 'BE' },
  { text: 'Ghent, Belgium', region: 'BE' },
  { text: 'Leuven, Belgium', region: 'BE' },

  // ============================================================
  // Nordics
  // ============================================================
  { text: 'Copenhagen, Denmark', region: 'DK' },
  { text: 'Aarhus, Denmark', region: 'DK' },
  { text: 'Odense, Denmark', region: 'DK' },
  { text: 'Helsinki, Finland', region: 'FI' },
  { text: 'Tampere, Finland', region: 'FI' },
  { text: 'Espoo, Finland', region: 'FI' },
  { text: 'Oulu, Finland', region: 'FI' },
  { text: 'Oslo, Norway', region: 'NO' },
  { text: 'Bergen, Norway', region: 'NO' },
  { text: 'Trondheim, Norway', region: 'NO' },
  { text: 'Stavanger, Norway', region: 'NO' },
  { text: 'Reykjavik, Iceland', region: 'IS' },

  // ============================================================
  // Baltics
  // ============================================================
  { text: 'Tallinn, Estonia', region: 'EE' },
  { text: 'Tartu, Estonia', region: 'EE' },
  { text: 'Riga, Latvia', region: 'LV' },
  { text: 'Vilnius, Lithuania', region: 'LT' },
  { text: 'Kaunas, Lithuania', region: 'LT' },

  // ============================================================
  // Eastern Europe
  // ============================================================
  { text: 'Bucharest, Romania', region: 'RO' },
  { text: 'Cluj-Napoca, Romania', region: 'RO' },
  { text: 'Timișoara, Romania', region: 'RO' },
  { text: 'Iași, Romania', region: 'RO' },
  { text: 'Sofia, Bulgaria', region: 'BG' },
  { text: 'Plovdiv, Bulgaria', region: 'BG' },
  { text: 'Athens, Greece', region: 'GR' },
  { text: 'Thessaloniki, Greece', region: 'GR' },
  { text: 'Kyiv, Ukraine', region: 'UA' },
  { text: 'Lviv, Ukraine', region: 'UA' },
  { text: 'Kharkiv, Ukraine', region: 'UA' },
  { text: 'Odesa, Ukraine', region: 'UA' },
  { text: 'Minsk, Belarus', region: 'BY' },
  { text: 'Belgrade, Serbia', region: 'RS' },
  { text: 'Novi Sad, Serbia', region: 'RS' },
  { text: 'Zagreb, Croatia', region: 'HR' },
  { text: 'Split, Croatia', region: 'HR' },
  { text: 'Ljubljana, Slovenia', region: 'SI' },
  { text: 'Bratislava, Slovakia', region: 'SK' },
  { text: 'Košice, Slovakia', region: 'SK' },

  // ============================================================
  // New Zealand (NZ) — ~4 cities
  // ============================================================
  { text: 'Auckland, New Zealand', region: 'NZ' },
  { text: 'Wellington, New Zealand', region: 'NZ' },
  { text: 'Christchurch, New Zealand', region: 'NZ' },
  { text: 'Hamilton, New Zealand', region: 'NZ' },

  // ============================================================
  // Caribbean & Central America
  // ============================================================
  { text: 'Kingston, Jamaica', region: 'JM' },
  { text: 'Port of Spain, Trinidad and Tobago', region: 'TT' },
  { text: 'San Juan, Puerto Rico', region: 'PR' },
  { text: 'Santo Domingo, Dominican Republic', region: 'DO' },
  { text: 'Havana, Cuba', region: 'CU' },
  { text: 'Guatemala City, Guatemala', region: 'GT' },

  // ============================================================
  // Central Asia & Caucasus
  // ============================================================
  { text: 'Tbilisi, Georgia', region: 'GE' },
  { text: 'Yerevan, Armenia', region: 'AM' },
  { text: 'Baku, Azerbaijan', region: 'AZ' },
  { text: 'Almaty, Kazakhstan', region: 'KZ' },
  { text: 'Nur-Sultan, Kazakhstan', region: 'KZ' },
  { text: 'Tashkent, Uzbekistan', region: 'UZ' },
  { text: 'Bishkek, Kyrgyzstan', region: 'KG' },

  // ============================================================
  // Myanmar & Cambodia
  // ============================================================
  { text: 'Yangon, Myanmar', region: 'MM' },
  { text: 'Phnom Penh, Cambodia', region: 'KH' },
  { text: 'Vientiane, Laos', region: 'LA' },

  // ============================================================
  // Mongolia
  // ============================================================
  { text: 'Ulaanbaatar, Mongolia', region: 'MN' },
];
