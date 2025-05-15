import updateItemToZoho from './updateItemToZoho.js'; // Assuming your updateItemToZoho is in a separate file

async function updateItemStock(
  item_id,
  initial_stock,
  authToken,
  po_stock = 0,
  so_stock = 0,
) {
  // Delay function
  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  // Calculate the new initial stock based on po_stock and so_stock
  let newInitialStock = initial_stock;

  // Update the initial stock by adding PO stock and subtracting SO stock
  if (po_stock) {
    newInitialStock += po_stock; // Add PO stock
  }
  if (so_stock) {
    newInitialStock -= so_stock; // Subtract SO stock
  }
  console.log('updateItemStock(), newInitialStock:', newInitialStock);

  // Prepare the updated payload
  const updatedPayload = {
    initial_stock: newInitialStock > 0 ? newInitialStock : 0, // Update only the initial stock
  };
  //   // Wait for 2 seconds before updating stock
  await delay(5000);

  // Call the update function with the new stock value
  try {
    const response = await updateItemToZoho(item_id, authToken, updatedPayload);
    console.log(
      'updateItemStock(), Item stock updated successfully:',
      response.message,
    );
  } catch (error) {
    console.error('Failed to update item stock:', error);
  }
}

// async function updateItemStock(
//   item_id,
//   initial_stock,
//   authToken,
//   po_stock = 0,
//   so_stock = 0
// ) {
//   // Delay function
//   function delay(ms) {
//     return new Promise((resolve) => setTimeout(resolve, ms));
//   }

//   // Calculate the new initial stock based on po_stock and so_stock
//   let newInitialStock = initial_stock;

//   // Update the initial stock by adding PO stock and subtracting SO stock
//   if (po_stock) {
//     newInitialStock += po_stock; // Add PO stock
//   }
//   if (so_stock) {
//     newInitialStock -= so_stock; // Subtract SO stock
//   }
//   console.log("updateItemStock(), newInitialStock:", newInitialStock);

//   // Prepare the updated payload
//   const updatedPayload = {
//     initial_stock: newInitialStock, // Update only the initial stock
//   };

//   // Wait for 2 seconds before updating stock
//   await delay(5000);

//   // Call the update function with the new stock value
//   try {
//     const response = await updateItemToZoho(item_id, authToken, updatedPayload);
//     console.log(
//       "updateItemStock(), Item stock updated successfully:",
//       response.message
//     );
//   } catch (error) {
//     console.error("Failed to update item stock:", error);
//   }
// }

export default updateItemStock;
