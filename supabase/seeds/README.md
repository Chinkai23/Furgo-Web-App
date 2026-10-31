# Local Finder Malaysia candidate seed

`local_finder_malaysia_osm_pet_friendly_candidates.csv` contains 60 records retrieved from OpenStreetMap on 30 October 2026. It contains 56 veterinary clinics, 1 cafe explicitly tagged `pets=yes`, and 3 parks/playgrounds explicitly tagged `dog=yes`. These are candidates for Manager or Director review; importing the CSV leaves them pending and does not make them visible to customers.

`local_finder_malaysia_pet_friendly_candidates.csv` combines those OSM records with 29 additional place candidates collected from public venue pages and published pet-friendly guides on 30 October 2026. The combined file has 89 unique rows: 26 cafes, 56 clinics, and 7 parks or designated outdoor areas. The added records include KL/Selangor and Penang cafes plus specific pet-access areas in Selangor and Kuala Lumpur. Each added row includes a source URL and is marked unverified; imports remain pending approval. Venue rules can change, so managers should confirm pet access, address, hours, and conditions before approving.

The public-web additions came from direct venue pages for The Rabbit Hole, Mews Cafe, Laki by VW, and Sunway properties, plus published guides from Buro Malaysia, Pet Lovers Centre Malaysia, and Cafe Culture Malaysia. This is a broader seed, not a complete list of every pet-friendly place in Malaysia. The entries do not copy Google Maps listings or reviews. [The Rabbit Hole](https://www.rabbithole.com.my/) says pets are allowed in a designated space; [Sunway 163 Mall](https://www.sunway163mall.com/faqs) and [Sunway Square](https://www.sunwaysquare.com/mall/faq) publish area-specific pet rules. Penang cafe conditions are summarized in [Pet Lovers Centre Malaysia's guide](https://blog.petloverscentre.com.my/pet-friendly-cafes-penang/), while the [Buro Malaysia guide](https://www.buro247.my/lifestyle/food-drink/pet-friendly-cafes-restaurants-kl-pj.html) covers KL/PJ venues.

The Overpass query included named Malaysian veterinary amenities and named cafes/restaurants/parks with positive pet access tags (`pets=yes`, `pet=yes`/`allowed`, `dogs=yes`, or `dog=yes`/`leashed`/`designated`/`permissive`). Place types without an explicit pet-access tag were not included, except veterinary clinics, which are listed as pet-care facilities and still require a human check of services/species. Unnamed entries and records without a useful address were excluded. Three missing addresses were resolved from the corresponding OpenStreetMap map pins using Photon.

This is not a complete national directory and the OSM snapshot does not prove that a business is still open or that its policy/hours remain current. Review each record and confirm current pet rules and details with the venue before approval. No event listings or photos were sourced.

OpenStreetMap data is available under the [Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/). Furgo's Local Finder listing page shows attribution to [© OpenStreetMap contributors](https://www.openstreetmap.org/copyright). The CSV includes a per-record OSM source link and `ODbL-1.0` license value. Keep attribution and applicable ODbL notices when using this data.

To regenerate the CSV from a saved Overpass JSON result:

```sh
python3 supabase/seeds/build_local_finder_osm_csv.py overpass-malaysia.json local_finder_malaysia_osm_pet_friendly_candidates.csv
```
