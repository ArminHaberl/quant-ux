
import * as TestUtil from './TestUtil'
import screenCopy from './data/screenCopyGroupBug.json'

// test('GroupCopyPasteBug.js - test copy', async () => {

    
   
//     const [controller, model] = TestUtil.createController(app)
   
//     const sourceGroup = model.groups['g10147_44252']
//     console.debug(sourceGroup)
//     //controller.onCopyGroup()
  
// })


test('GroupCopyPasteBug.js - screenCopy', async () => {
   
    const [controller] = TestUtil.createController(screenCopy)
   
    controller.onCopyScreen('s10000_33759', {x:0, y:0})

    //console.debug(model.groups)

  
})


