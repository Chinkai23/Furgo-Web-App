import { bottomNavigation, escapeHTML } from '../shared.js';

const petStorageKey = 'furgo-demo-pet-profiles';

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

// Reads the saved pet that the customer wants to view or edit.
function findPet(petId) {
  try {
    const pets = JSON.parse(localStorage.getItem(petStorageKey) || '[]');
    return pets.find((pet) => pet.id === petId) || null;
  } catch {
    return null;
  }
}

// Shows a blank pet form for Add New Pet or fills it with the selected pet for editing.
export function petProfilePage({ petId = '', mode = '', returnTo = 'home' } = {}) {
  const savedPet = petId ? findPet(petId) : null;
  const isNew = mode === 'add' || !savedPet;
  const pet = isNew ? {} : savedPet;
  const remarks = Array.isArray(pet.remarks) ? pet.remarks : [...(pet.tags || []), ...(pet.redFlagRemark ? [pet.redFlagRemark] : [])];
  const icon = (file) => `Image/Icon/${encodeURIComponent(file)}`;
  const avatar = pet.photo || icon('Icon-17.png');
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
  const breedOptions = dogBreeds.map((breed) => `<option value="${escapeHTML(breed)}"></option>`).join('');
  const remarkChips = remarks.map((remark, index) => `<span class="pet-remark-chip" data-remark-value="${escapeHTML(remark)}">${escapeHTML(remark)}<button type="button" data-remove-remark="${index}" aria-label="Delete remark: ${escapeHTML(remark)}">×</button></span>`).join('');
  const vaccinationCards = Array.isArray(pet.vaccinationCards) ? pet.vaccinationCards : [];
  const vaccinationCardRows = vaccinationCards.map((card, index) => `<li><a href="${escapeHTML(card.data)}" target="_blank" rel="noopener">${escapeHTML(card.name)}</a><button type="button" data-remove-vaccination-card="${index}" aria-label="Remove ${escapeHTML(card.name)}">×</button></li>`).join('');

  return `<main class="pet-profile-page">
    <header class="profile-heading"><a class="profile-back" href="${returnTo === 'profile' ? '#profile' : returnTo === 'grooming' ? '#grooming' : returnTo === 'hotel' ? '#hotel' : '#home'}" aria-label="${returnTo === 'profile' ? 'Back to My Profile' : returnTo === 'grooming' ? 'Back to Grooming' : returnTo === 'hotel' ? 'Back to Pet Hotel' : 'Back to Home'}">‹</a><h1>Pet Profile</h1></header>
    <form class="pet-profile-form" data-pet-profile-form data-pet-id="${escapeHTML(pet.id || '')}" data-is-new="${isNew}">
      <label class="pet-profile-photo ${pet.photo ? 'has-photo' : ''}" aria-label="Add or change pet photo"><img data-pet-profile-preview src="${escapeHTML(avatar)}" alt="${pet.photo ? `${escapeHTML(pet.name)} profile photo` : 'Add a pet photo'}" /><span class="pet-photo-prompt">${pet.photo ? 'Change Photo' : 'Add Photo'}</span><input type="file" name="photo" accept="image/*" data-pet-profile-photo /></label>
      <!-- Photo crop dialog: owner positions and zooms a circular crop before using the photo. -->
      <dialog class="pet-photo-crop-dialog" data-photo-crop-dialog aria-labelledby="photo-crop-title">
        <h2 id="photo-crop-title">Adjust Pet Photo</h2><p>Drag the photo and use the slider to fit it inside the circle.</p>
        <div class="pet-photo-crop-viewport" data-photo-crop-viewport tabindex="0" aria-label="Photo crop area. Drag to reposition, or use arrow keys."><img data-photo-crop-image alt="Photo crop preview" /></div>
        <label class="pet-photo-zoom">Zoom<input type="range" min="1" max="3" step="0.01" value="1" data-photo-crop-zoom /></label>
        <div class="pet-photo-crop-actions"><button type="button" data-cancel-photo-crop>Cancel</button><button type="button" data-use-photo-crop>Use Photo</button></div>
      </dialog>
      <!-- Pet details section: owners edit identity, breed, age, gender, and care measurements. -->
      <div class="pet-profile-fields">
        <label class="pet-form-field pet-name-field">Pet Name<input name="name" required maxlength="60" value="${escapeHTML(pet.name || '')}" /></label>
        <label class="pet-form-field">Breed<input name="breed" list="dog-breed-suggestions" autocomplete="off" maxlength="80" placeholder="Type or choose a breed" value="${escapeHTML(pet.breed || '')}" /><datalist id="dog-breed-suggestions">${breedOptions}</datalist></label>
        <label class="pet-form-field">Gender<select name="sex"><option value="">Select gender</option><option value="Male" ${pet.sex === 'Male' ? 'selected' : ''}>Male</option><option value="Female" ${pet.sex === 'Female' ? 'selected' : ''}>Female</option></select></label>
        <div class="pet-form-field pet-birth-date-field"><span>Birth Date</span><div class="pet-birth-date-selects"><select data-birth-day aria-label="Birth day"><option value="">Day</option>${birthDayOptions}</select><select data-birth-month aria-label="Birth month"><option value="">Mon</option>${birthMonthOptions}</select><select data-birth-year aria-label="Birth year"><option value="">Year</option>${birthYearOptions}</select></div></div>
        <input type="hidden" name="birthDate" value="${escapeHTML(pet.birthDate || '')}" data-birth-date-value />
        <label class="pet-form-field">Neutered / Spayed<select name="neutered"><option value="">Select</option><option value="yes" ${pet.neutered === 'yes' ? 'selected' : ''}>Yes</option><option value="no" ${pet.neutered === 'no' ? 'selected' : ''}>No</option></select></label>
        <label class="pet-form-field">Weight (kg)<input name="weight" type="number" min="0" max="200" step="0.1" value="${escapeHTML(pet.weight || '')}" /></label>
        <label class="pet-form-field">Colour<input name="colour" maxlength="60" placeholder="e.g. White and grey" value="${escapeHTML(pet.colour || '')}" /></label>
      </div>
      <!-- Vaccination documents section: add, open, and remove vaccination card images or PDFs. -->
      <section class="pet-vaccination-section" aria-labelledby="pet-vaccination-title"><h2 id="pet-vaccination-title">Vaccination Cards</h2><p>Upload vaccination card images or PDF documents. Up to 3 files, 1.5 MB each (2.5 MB total).</p><label class="pet-vaccination-upload"><span>Choose files</span><input type="file" name="vaccinationCards" accept="image/*,.pdf,application/pdf" multiple data-vaccination-upload /></label><ul class="pet-vaccination-list" data-vaccination-list>${vaccinationCardRows || '<li class="pet-vaccination-empty">No vaccination cards uploaded.</li>'}</ul><label class="pet-form-field pet-vaccination-expiry">Vaccination valid through<input type="date" name="vaccinationValidUntil" value="${escapeHTML(pet.vaccinationValidUntil || '')}" /><small>Pet Hotel bookings require a current record that remains valid through check-out.</small></label></section>
      <section class="pet-remarks-section" aria-labelledby="pet-remarks-title"><h2 id="pet-remarks-title">Remark:</h2><p class="pet-remarks-help">Specify behavioral traits, medical history, sensitivities, or aggression alerts (e.g., severe anxiety, skin allergies, biting risk).</p><div class="pet-remark-entry"><input name="remarkDraft" data-remark-draft maxlength="160" aria-label="New pet remark" /><button type="button" class="pet-add-remark" data-add-remark>Add Remark</button></div><div class="pet-remarks-list" data-remarks-list>${remarkChips}</div></section>
      <div class="form-feedback" role="status" aria-live="polite"></div><button class="button button-primary pet-save-profile" type="submit">Save Profile</button>
      ${isNew ? '' : '<button class="pet-delete-trigger" type="button" data-open-delete-confirm>Delete Profile</button><dialog class="pet-delete-dialog" data-pet-delete-dialog aria-labelledby="delete-pet-title"><h2 id="delete-pet-title">Confirm delete profile?</h2><p>Are you sure you want to delete this pet profile?</p><div class="pet-delete-actions"><button type="button" data-cancel-delete>Cancel</button><button type="button" data-confirm-delete>Yes, delete</button></div></dialog>'}
    </form>
    ${bottomNavigation(returnTo === 'profile' ? 'profile' : returnTo === 'grooming' ? 'grooming' : returnTo === 'hotel' ? 'hotel' : 'home', icon)}
  </main>`;
}
