import { bottomNavigation, escapeHTML } from '../shared.js';
import { petProfilesStorageKeyForCurrentUser } from './home.js';

// Show up to 50 breed suggestions, ordered from commonly seen to less common in Malaysia.
// Breed is still a free-text field, so owners can enter a breed that is not listed.
const dogBreeds = [
  'Mixed Breed / Kampung Dog', 'Poodle (Toy)', 'Poodle (Miniature)', 'Shih Tzu', 'Pomeranian',
  'Miniature Schnauzer', 'Rottweiler', 'Golden Retriever', 'French Bulldog', 'Pug',
  'Labrador Retriever', 'German Shepherd', 'Pembroke Welsh Corgi', 'Maltese', 'Maltipoo',
  'Chihuahua', 'Siberian Husky', 'Beagle', 'Dachshund', 'Cocker Spaniel',
  'Japanese Spitz', 'Border Collie', 'Jack Russell Terrier', 'Bichon Frise', 'Samoyed',
  'Dobermann', 'Bulldog', 'American Cocker Spaniel', 'Cavalier King Charles Spaniel', 'Shiba Inu',
  'Alaskan Malamute', 'Dalmatian', 'Chow Chow', 'Boxer', 'Bull Terrier',
  'Shetland Sheepdog', 'English Springer Spaniel', 'West Highland White Terrier', 'Yorkshire Terrier', 'Pekingese',
  'Shar Pei', 'Belgian Shepherd', 'Australian Shepherd', 'Australian Cattle Dog', 'Great Dane',
  'Akita', 'Affenpinscher', 'American Pit Bull Terrier', 'Staffordshire Bull Terrier', 'Schnauzer (Standard)',
];
const catBreeds = [
  'Domestic Shorthair', 'Domestic Longhair', 'Persian', 'Siamese', 'British Shorthair',
  'Ragdoll', 'Maine Coon', 'Bengal', 'Scottish Fold', 'American Shorthair',
  'Exotic Shorthair', 'Russian Blue', 'Sphynx', 'Birman', 'Abyssinian',
  'British Longhair', 'Turkish Angora', 'Oriental Shorthair', 'Norwegian Forest Cat', 'Mixed Breed Cat',
];

// Reads the saved pet that the customer wants to view or edit.
function findPet(petId) {
  try {
    const pets = JSON.parse(localStorage.getItem(petProfilesStorageKeyForCurrentUser()) || '[]');
    return pets.find((pet) => pet.id === petId) || null;
  } catch {
    return null;
  }
}

// Shows a blank pet form for Add New Pet or fills it with the selected pet for editing.
export function petProfileEditPage({ petId = '', mode = '', returnTo = 'home' } = {}) {
  const savedPet = petId ? findPet(petId) : null;
  if (petId && mode !== 'add' && !savedPet) {
    return `<main class="pet-profile-page"><header class="profile-heading"><a class="profile-back" href="#home" aria-label="Back to Home">‹</a><h1>Pet Profile</h1></header><section class="profile-summary"><h2>Pet profile not found</h2><p>This pet may have been removed. Return home to choose another pet.</p><a class="button button-primary" href="#home">Go to Home</a></section>${bottomNavigation('home', (file) => `Image/Icon/${encodeURIComponent(file)}`)}</main>`;
  }
  const isNew = mode === 'add' || !savedPet;
  const pet = isNew ? {} : savedPet;
  const remarks = Array.isArray(pet.remarks) ? pet.remarks : [...(pet.tags || []), ...(pet.redFlagRemark ? [pet.redFlagRemark] : [])];
  const icon = (file) => `Image/Icon/${encodeURIComponent(file)}`;
  const [birthYear = '', birthMonth = '', birthDay = ''] = (pet.birthDate || '').split('-');
  const currentYear = new Date().getFullYear();
  const birthYearOptions = Array.from({ length: Math.max(0, currentYear - 1899) }, (_, index) => {
    const year = String(currentYear - index);
    return `<option value="${year}" ${birthYear === year ? 'selected' : ''}>${year}</option>`;
  }).join('');
  const birthMonthOptions = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    .map((month, index) => `<option value="${String(index + 1).padStart(2, '0')}" ${birthMonth === String(index + 1).padStart(2, '0') ? 'selected' : ''}>${month}</option>`).join('');
  const birthDayCount = birthMonth ? new Date(Number(birthYear || currentYear), Number(birthMonth), 0).getDate() : 31;
  const birthDayOptions = Array.from({ length: birthDayCount }, (_, index) => {
    const day = String(index + 1).padStart(2, '0');
    return `<option value="${day}" ${birthDay === day ? 'selected' : ''}>${day}</option>`;
  }).join('');
  const species = pet.species === 'Cat' || catBreeds.includes(pet.breed) ? 'Cat' : 'Dog';
  const dogAssistantImage = `Image/Pet Assistant Library/${encodeURIComponent('Furgo Assistant Dog.png')}`;
  const catAssistantImage = `Image/Pet Assistant Library/${encodeURIComponent('Furgo Assistant Cat.png')}`;
  const breedOptions = [
    ...dogBreeds.map((breed, index) => `<button type="button" role="option" aria-selected="false" id="dog-breed-option-${index}" data-breed-species="Dog" data-breed-option="${escapeHTML(breed)}"${species === 'Cat' ? ' hidden' : ''}>${escapeHTML(breed)}</button>`),
    ...catBreeds.map((breed, index) => `<button type="button" role="option" aria-selected="false" id="cat-breed-option-${index}" data-breed-species="Cat" data-breed-option="${escapeHTML(breed)}"${species === 'Dog' ? ' hidden' : ''}>${escapeHTML(breed)}</button>`),
  ].join('');
  const remarkChips = remarks.map((remark, index) => `<span class="pet-remark-chip" data-remark-value="${escapeHTML(remark)}">${escapeHTML(remark)}<button type="button" data-remove-remark="${index}" aria-label="Delete remark: ${escapeHTML(remark)}">×</button></span>`).join('');

  return `<main class="pet-profile-page">
    <header class="profile-heading"><a class="profile-back" href="${returnTo === 'pet-profile' && pet.id ? `#pet-profile?id=${encodeURIComponent(pet.id)}` : returnTo === 'profile' ? '#profile' : returnTo === 'grooming' ? '#grooming' : returnTo === 'hotel' ? '#hotel' : '#home'}" aria-label="${returnTo === 'pet-profile' ? 'Back to Pet Profile' : returnTo === 'profile' ? 'Back to My Profile' : returnTo === 'grooming' ? 'Back to Grooming' : returnTo === 'hotel' ? 'Back to Pet Hotel' : 'Back to Home'}">‹</a><h1>${isNew ? 'Add Pet Profile' : 'Edit Pet Profile'}</h1></header>
    <form class="pet-profile-form" data-pet-profile-form data-pet-id="${escapeHTML(pet.id || '')}" data-is-new="${isNew}" data-profile-picture-mode="${escapeHTML(pet.profilePictureMode || (pet.photo ? 'photo' : 'default'))}">
      <!-- Profile picture and avatar controls live on the Pet Profile overview. -->
      <!-- Pet details section: owners edit identity, breed, age, gender, and care measurements. -->
      <div class="pet-profile-fields">
        <label class="pet-form-field pet-name-field">Pet Name<input name="name" required maxlength="60" value="${escapeHTML(pet.name || '')}" /></label>
        <input type="hidden" name="species" value="${species}" data-pet-species />
        <fieldset class="pet-species-field">
          <legend>Type of Pet</legend>
          <div class="pet-species-options">
            <label class="pet-species-choice" data-species-choice-card ${species === 'Dog' ? 'data-selected="true"' : ''}>
              <input type="radio" name="species-choice" value="Dog" data-pet-species-choice ${species === 'Dog' ? 'checked' : ''} />
              <img src="${dogAssistantImage}" alt="" />
              <span>Dog</span>
            </label>
            <label class="pet-species-choice" data-species-choice-card ${species === 'Cat' ? 'data-selected="true"' : ''}>
              <input type="radio" name="species-choice" value="Cat" data-pet-species-choice ${species === 'Cat' ? 'checked' : ''} />
              <img src="${catAssistantImage}" alt="" />
              <span>Cat</span>
            </label>
          </div>
        </fieldset>
        <div class="pet-form-field pet-breed-field"><label for="pet-breed-input">Breed</label><div class="pet-breed-control"><input id="pet-breed-input" name="breed" role="combobox" aria-autocomplete="list" aria-controls="pet-breed-listbox" aria-expanded="false" autocomplete="off" maxlength="80" value="${escapeHTML(pet.breed || '')}" data-breed-input /><div class="pet-breed-listbox" id="pet-breed-listbox" role="listbox" data-breed-listbox hidden>${breedOptions}</div></div></div>
        <fieldset class="pet-form-field pet-button-choice-field"><legend>Gender</legend><div class="pet-button-choices"><label><input type="radio" name="sex" value="Male" ${pet.sex === 'Male' || !pet.sex ? 'checked' : ''} /><span>Male</span></label><label><input type="radio" name="sex" value="Female" ${pet.sex === 'Female' ? 'checked' : ''} /><span>Female</span></label></div></fieldset>
        <div class="pet-form-field pet-birth-date-field"><span>Birthday or Adoption Day</span><div class="pet-birth-date-selects"><select data-birth-day aria-label="Day"><option value="">Day</option>${birthDayOptions}</select><select data-birth-month aria-label="Month"><option value="">Month</option>${birthMonthOptions}</select><select data-birth-year aria-label="Year"><option value="">Year</option>${birthYearOptions}</select></div></div>
        <input type="hidden" name="birthDate" value="${escapeHTML(pet.birthDate || '')}" data-birth-date-value />
        <label class="pet-form-field">Weight (kg)<input name="weight" type="number" min="0" max="200" step="0.1" value="${escapeHTML(pet.weight || '')}" /></label>
        <fieldset class="pet-form-field pet-button-choice-field"><legend>Neutered / Spayed</legend><div class="pet-button-choices"><label><input type="radio" name="neutered" value="yes" ${pet.neutered === 'yes' ? 'checked' : ''} /><span>Yes</span></label><label><input type="radio" name="neutered" value="no" ${pet.neutered === 'no' || !pet.neutered ? 'checked' : ''} /><span>No</span></label></div></fieldset>
      </div>
      <section class="pet-remarks-section" aria-labelledby="pet-remarks-title"><h2 id="pet-remarks-title">Remark:</h2><p class="pet-remarks-help">Specify behavioral traits, medical history, sensitivities, or aggression alerts (e.g., severe anxiety, skin allergies, biting risk).</p><div class="pet-remark-entry"><input name="remarkDraft" data-remark-draft maxlength="160" aria-label="New pet remark" /><button type="button" class="pet-add-remark" data-add-remark>Add Remark</button></div><div class="pet-remarks-list" data-remarks-list>${remarkChips}</div></section>
      <div class="form-feedback" role="status" aria-live="polite"></div><button class="button button-primary pet-save-profile" type="submit">Save Profile</button>
    </form>
    ${bottomNavigation(returnTo === 'profile' ? 'profile' : returnTo === 'grooming' ? 'grooming' : returnTo === 'hotel' ? 'hotel' : 'home', icon)}
  </main>`;
}
