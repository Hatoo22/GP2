const signupForm = document.getElementById('signupForm');
const signupMessage = document.getElementById('signupMessage');
const signupBtn = document.getElementById('signupBtn');

const accountTypeCards = document.querySelectorAll('.accountTypeCard');
const signupFields = document.getElementById('signupFields');

const accountTypeSection =
  document.querySelector('.authAccountTypeSection');

const changeRoleBtn =
  document.getElementById('changeRoleBtn');

const selectedRoleLabel =
  document.getElementById('selectedRoleLabel');

const emailLabel =
  document.getElementById('emailLabel');

const signupEmail =
  document.getElementById('signupEmail');

const organizationLogo =
  document.getElementById('organizationLogo');

const organizationBadge =
  document.getElementById('organizationBadge');

const employeeEmailHint =
  document.getElementById('employeeEmailHint');

let selectedRole = null;

let organizationCheckTimer;

signupEmail.addEventListener('input', () => {

  clearTimeout(organizationCheckTimer);

  organizationBadge.hidden = true;
  organizationLogo.removeAttribute('src');

  if (selectedRole !== 'employee') {
    return;
  }

  const email = signupEmail.value.trim();

  if (!email.includes('@')) {
    return;
  }

  organizationCheckTimer = setTimeout(async () => {

    try {

      const response = await fetch(
        `api/check-organization.php?email=${encodeURIComponent(email)}`
      );

      const result = await response.json();

      if (
        result.success &&
        result.found &&
        result.organization
      ) {

        organizationLogo.src =
  result.organization.logo_url;

organizationBadge.hidden = false;

      }

    } catch (error) {

      organizationBadge.hidden = true;

    }

  }, 300);

});



function showSignupMessage(text, type) {

  signupMessage.hidden = false;

  signupMessage.textContent = text;

  signupMessage.className =
    `formMessage authMessage ${type}`;
}



function revealFields(role) {

  signupFields.hidden = false;


  requestAnimationFrame(() => {

    signupFields.classList.add('is-visible');

  });


  accountTypeSection.classList.add('role-selected');


  selectedRoleLabel.textContent =
    role === 'employee'
      ? 'Employee account details'
      : 'Individual account details';



  if (role === 'employee') {

    emailLabel.textContent = 'Work Email';

    signupEmail.placeholder =
      'Enter your organization email';

    employeeEmailHint.hidden = false;

  }

  else {

  emailLabel.textContent = 'Email';

  signupEmail.placeholder =
    'Enter your email';

  employeeEmailHint.hidden = true;

  organizationBadge.hidden = true;
  organizationLogo.removeAttribute('src');

}



  setTimeout(() => {

    signupFields.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest'
    });

  }, 160);

}



/* =========================
   ACCOUNT TYPE
========================= */

accountTypeCards.forEach(card => {
  card.addEventListener('click', () => {

    selectedRole = card.dataset.role;

    document.getElementById('firstName').value = '';
document.getElementById('lastName').value = '';
signupEmail.value = '';
document.getElementById('signupPassword').value = '';

organizationBadge.hidden = true;
organizationLogo.removeAttribute('src');

signupMessage.hidden = true;

    accountTypeCards.forEach(item => {
      item.classList.remove('selected');
    });

    card.classList.add('selected');

    signupFields.hidden = false;
    signupMessage.hidden = true;

    requestAnimationFrame(() => {
      signupFields.classList.add('is-visible');
    });

    /* EMPLOYEE */
    if (selectedRole === 'employee') {

      emailLabel.textContent = 'Work email';

      signupEmail.placeholder =
        'Enter your organization email';

      employeeEmailHint.textContent =
        'Please enter a valid organization email address';

      employeeEmailHint.hidden = false;

    }

    /* INDIVIDUAL */
    else {

      emailLabel.textContent = 'Email';

      signupEmail.placeholder =
        'Enter your email';

      employeeEmailHint.hidden = true;

    }

    window.dispatchEvent(
      new CustomEvent('dira:role-selected', {
        detail: {
          role: selectedRole
        }
      })
    );

  });
});



/* =========================
   CHANGE ACCOUNT TYPE
========================= */

if (changeRoleBtn) {

  changeRoleBtn.addEventListener('click', () => {


    selectedRole = null;


    accountTypeCards.forEach(item => {

      item.classList.remove('selected');

    });


    signupFields.classList.remove('is-visible');


    accountTypeSection.classList.remove(
      'role-selected'
    );


    document.body.removeAttribute(
      'data-auth-role'
    );



    setTimeout(() => {

      signupFields.hidden = true;


      accountTypeSection.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });

    }, 220);

  });

}



/* =========================
   SUBMIT SIGNUP
========================= */

signupForm.addEventListener(
  'submit',
  async (event) => {


    event.preventDefault();



    if (!selectedRole) {

      showSignupMessage(
        'Please choose an account type.',
        'error'
      );

      return;

    }



    const firstName =
      document
        .getElementById('firstName')
        .value
        .trim();


    const lastName =
      document
        .getElementById('lastName')
        .value
        .trim();


    const email =
      signupEmail.value.trim();

    if (
  selectedRole === 'employee' &&
  !email.toLowerCase().endsWith('@gmedia.gov.sa')
) {
  showSignupMessage(
    'Please enter a valid organization email address',
    'error'
  );

  return;
}


    const password =
      document
        .getElementById('signupPassword')
        .value;



    if (
      !firstName ||
      !lastName ||
      !email ||
      !password
    ) {

      showSignupMessage(
        'Please fill in all fields.',
        'error'
      );

      return;

    }



    const passwordRegex =
      /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;



    if (!passwordRegex.test(password)) {

      showSignupMessage(

        'Password must be at least 8 characters and include both letters and numbers.',

        'error'

      );

      return;

    }



    try {


      signupBtn.disabled = true;

      signupBtn.innerHTML =
        'Creating...';



      const response =
        await fetch(
          'api/register.php',
          {

            method: 'POST',

            headers: {
              'Content-Type':
                'application/json'
            },

            body: JSON.stringify({

              first_name: firstName,

              last_name: lastName,

              email,

              password,

              role: selectedRole

            })

          }
        );



      const result =
        await response.json();



      if (
        !response.ok ||
        !result.success
      ) {

        showSignupMessage(

          result.message ||
          'Sign up failed. Please try again.',

          'error'

        );

        return;

      }



      if (result.user.role === 'employee') {

  showSignupMessage(
    'Your employee account has been created and is pending administrator approval.',
    'success'
  );

  setTimeout(() => {

    window.location.href =
      'login.html';

  }, 1500);

} else {

  localStorage.setItem(
    'diraUser',
    JSON.stringify(result.user)
  );

  showSignupMessage(
    'Account created successfully. Redirecting...',
    'success'
  );

  setTimeout(() => {

    window.location.href =
      'home.html';

  }, 900);

}


    }

    catch (error) {


      showSignupMessage(

        'Cannot connect to the server. Make sure Apache and MySQL are running in XAMPP.',

        'error'

      );

    }

    finally {


      signupBtn.disabled = false;


      signupBtn.innerHTML =
        'Create Account <span>→</span>';

    }

  }
);