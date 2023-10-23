type ModalProps = {
  headerText: string,
  mapDeviceToInfo: Function,
  onClose: Function,
  added?: Function
  removed?: Function
}

const name = 'commoners-modal'

export default (props: ModalProps) => {

  if (!customElements.get(name)) {


    const template = document.createElement('template');

    template.innerHTML = `
      <style>

      h3 {
        margin: 0;
      }

      dialog {
        padding: 0;
        display: flex;
      }

      section {
        position: relative;
        display: grid;
        grid-template-rows: min-content 1fr min-content;
        overflow: hidden;
      }
    
      header {
        padding: 16px;
        padding-bottom: 10px;

        background: white;
        border-bottom: 1px solid gainsboro;
      }
    
      footer {
        padding: 16px;
        padding-top: 10px;
        background: white;
        border-top: 1px solid gainsboro;
      }
    
      main {
        padding: 0px 16px;
        overflow: auto;
        max-height: 300px;
        min-width: 500px;
      }
    
      </style>
      <dialog>
        <section>
          <header>
            <h3></h3>
          </header>
          <main>
            <ul></ul>
          </main>
          <footer>
              <button id="cancel">Cancel</button>
              <button id="pair">Pair</button>
          </footer>
        </section>
      </dialog>
    `;


    class CommonersModal extends HTMLElement {

      headerText: ModalProps['headerText'] = 'Available Devices'
      mapDeviceToInfo: ModalProps['mapDeviceToInfo'] 
      onClose: ModalProps['onClose'] 
      added: ModalProps['added'] 
      removed: ModalProps['removed'] 

      constructor(props) {
        super()
        Object.assign(this, props)
      }

      devices = []

      selectedDevice = ''

      getDialog = () => {
        return this.shadowRoot.querySelector('dialog') as HTMLDialogElement
      }

      connectedCallback() {

        this.attachShadow({mode: 'open'});

        this.shadowRoot.appendChild(template.content.cloneNode(true));

        const dialog = this.getDialog()
        dialog.addEventListener('click', () => dialog.close());

        const container = this.shadowRoot.querySelector('section') as HTMLElement
        container.addEventListener('click', (event) => event.stopPropagation());
      
        const title = this.shadowRoot.querySelector('h3') as HTMLElement
        title.innerText = this.headerText
      
        const ul = this.shadowRoot.querySelector('ul') as HTMLUListElement

        const cancelButton = this.shadowRoot.getElementById('cancel') as HTMLButtonElement
        cancelButton.addEventListener('click', () => dialog.close());
      
        const pairButton = this.shadowRoot.getElementById('pair') as HTMLButtonElement
        pairButton.addEventListener('click', () => dialog.close(this.selectedDevice))
      
        dialog.addEventListener('close', () => this.onClose(dialog.returnValue ?? ''))
      
        // Wath for when the dialog opens
        let observer = new MutationObserver((ev) => {
          if (ev[0].attributeName == 'open') {
            ul.innerText = ''
            this.selectedDevice = ''
            pairButton.setAttribute('disabled', '')
            this.renderList(this.devices)
          }
        });
      
        observer.observe(dialog, { attributes: true })

        const { added, removed } = this
      
        if (added) added((device) => ul.append(this.createListItem(this.mapDeviceToInfo(device))))
      
        if (removed) removed((device) => {
          const info = this.mapDeviceToInfo(device)
          const el = dialog.querySelector(`[data-id="${info.id}"]`) as HTMLLIElement
          el.remove()
        })
      }

      createListItem = ({ name, info, id }) => {
        const li = document.createElement('li')
        li.style.cursor = 'pointer'
        li.innerText = info ? `${name} (${info})` : name
        li.setAttribute('data-id', id)
        li.onclick = () => this.onItemClicked(id)
        return li
      }

      onItemClicked = (id) => {
        const pairButton = this.shadowRoot.getElementById('pair') as HTMLButtonElement
        pairButton.removeAttribute('disabled')
        this.selectedDevice = id
      } 

      renderList = (devices) => {
        const dialog = this.getDialog()
        const ul = this.shadowRoot?.querySelector('ul') as HTMLUListElement
        const mapped = devices.map(this.mapDeviceToInfo)
        const filtered = mapped.filter(o => !dialog.querySelector(`[data-id="${o.id}"]`))
        ul.append(...filtered.map(this.createListItem))
      }

      showModal = () => this.getDialog().showModal()

      close = () => this.getDialog().close()
      
      update = (update) => {
        this.renderList(this.devices = update)
      }
      
    }

    window.customElements.define('commoners-modal', CommonersModal);
  }
    
  const modal = document.createElement(name)
  Object.assign(modal, props)
  
  return modal

}